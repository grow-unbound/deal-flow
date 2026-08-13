import { NextRequest, NextResponse } from 'next/server';
import { getPostHogClient } from '@/lib/posthog-server';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { mintBuyerSession, mintSellerSession, toBuyerLoginCandidate } from '@/lib/server/buyer-access';
import { buyerOtpStore, writeVerifiedCandidatesRecord, type LoginOtpCandidate } from '@/lib/server/buyer-otp-store';
import { stampSellerImplicitWhatsappConsent } from '@/lib/server/whatsapp-consent';

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/phone-otp/verify
 * Body: { ref_id: string; otp: string }
 * Returns:
 *   single match    → { success: true; redirect: string; session }
 *   multiple matches → { success: true; contexts: LoginOtpContext[]; ref_id: string }
 *   error            → { error: string } with appropriate status
 *
 * Seller accounts are always preferred over buyer accounts for the same phone number.
 * When more than one account remains after that preference, the client is
 * handed a short-lived `verified` OTP record's ref_id and shows
 * a context-selection screen (see /login/select-context and
 * /api/auth/phone-otp/select-context) instead of guessing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { ref_id?: string; otp?: string };
    const ref_id: string = (body?.ref_id ?? '').trim();
    const otp: string = (body?.otp ?? '').trim();

    if (!ref_id || !otp) {
      return NextResponse.json({ error: 'ref_id and otp are required' }, { status: 400 });
    }

    const record = await buyerOtpStore.get(ref_id);

    if (!record || record.kind !== 'pending') {
      return NextResponse.json({ error: 'Invalid or expired OTP session' }, { status: 400 });
    }

    if (Date.now() > record.expiresAt) {
      await buyerOtpStore.delete(ref_id);
      return NextResponse.json({ error: 'OTP has expired. Request a new one.' }, { status: 400 });
    }

    record.attempts += 1;

    if (record.attempts > MAX_ATTEMPTS) {
      await buyerOtpStore.delete(ref_id);
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Request a new OTP.' },
        { status: 429 },
      );
    }

    if (record.otp !== otp) {
      // Save updated attempt count before responding
      await buyerOtpStore.set(ref_id, record);
      return NextResponse.json(
        { error: `Incorrect OTP. ${MAX_ATTEMPTS - record.attempts} attempt(s) remaining.` },
        { status: 400 },
      );
    }

    await buyerOtpStore.delete(ref_id);

    if (record.candidates.length === 0) {
      return NextResponse.json(
        { error: 'No account found for this number.' },
        { status: 403 },
      );
    }

    try {
      const ph = getPostHogClient();
      const first = record.candidates[0];
      ph.capture({
        distinctId: first.buyer_id ?? first.tenant_id,
        event: 'otp_verified',
        properties: {
          candidate_kind: first.kind,
          tenant_count: record.candidates.length,
          tenant_id: first.tenant_id,
          role: first.role,
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    // Show every distinct account linked to this phone — findAllLoginCandidates
    // already dedups true same-account collisions (a buyer row whose user_id
    // matches an existing seller). No kind-level priority beyond that: a seller
    // at one tenant and a buyer at an unrelated tenant should both be offered.
    const effectiveCandidates = record.candidates;

    if (effectiveCandidates.length > 1) {
      const verifiedRefId = await writeVerifiedCandidatesRecord(record.phone, effectiveCandidates);
      if (!verifiedRefId) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      return NextResponse.json({ success: true, contexts: effectiveCandidates, ref_id: verifiedRefId });
    }

    const candidate = effectiveCandidates[0];
    const { session, redirect } = await mintCandidateSession(request, candidate);
    return NextResponse.json({ success: true, redirect, session });
  } catch (err) {
    console.error('[phone-otp/verify] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function mintCandidateSession(
  request: NextRequest,
  candidate: LoginOtpCandidate,
): Promise<{ session: unknown; redirect: string }> {
  if (candidate.kind === 'seller') {
    const { session, user } = await mintSellerSession(
      candidate as LoginOtpCandidate & { kind: 'seller' },
    );
    await stampSellerImplicitWhatsappConsent(candidate.tenant_id, user.id);
    return { session, redirect: '/dashboard' };
  }

  const { session } = await mintBuyerSession(toBuyerLoginCandidate(candidate));
  const { supabaseAdmin } = await import('@/lib/supabase');
  if (supabaseAdmin && candidate.buyer_id) {
    void recordBuyerAppActivitySafe(supabaseAdmin as any, {
      tenantId: candidate.tenant_id,
      buyerId: candidate.buyer_id,
      eventName: 'session_started',
      path: request.nextUrl.pathname,
      context: {
        role: candidate.role,
        principal_type: candidate.principal_type,
      },
    });
  }
  // WhatsApp Broadcast Phase C (§4.8, §9): route first-time buyers through the
  // forced consent checkbox before /buy/catalog. requireBuyerConsentRedirect
  // checks app.buyers.whatsapp_consent_at directly rather than trusting any
  // client-supplied state.
  const redirect = await requireBuyerConsentRedirect(candidate.buyer_id) ?? '/buy/catalog';
  return { session, redirect };
}

async function requireBuyerConsentRedirect(buyerId: string | null): Promise<string | null> {
  if (!buyerId) return null;
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    if (!supabaseAdmin) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data } = await db
      .schema('app')
      .from('buyers')
      .select('whatsapp_consent_at')
      .eq('id', buyerId)
      .maybeSingle();
    return data && !data.whatsapp_consent_at ? '/consent' : null;
  } catch {
    return null;
  }
}
