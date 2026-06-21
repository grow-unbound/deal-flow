import { NextRequest, NextResponse } from 'next/server';
import { getPostHogClient } from '@/lib/posthog-server';
import { mintBuyerSession, mintSellerSession, toBuyerLoginCandidate } from '@/lib/server/buyer-access';
import { buyerOtpStore, type LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/phone-otp/verify
 * Body: { ref_id: string; otp: string }
 * Returns:
 *   success → { success: true; redirect: string; session }
 *   error   → { error: string } with appropriate status
 *
 * Seller accounts are always preferred over buyer accounts for the same phone number.
 * The first effective candidate is auto-minted — no context selection screen is shown.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { ref_id?: string; otp?: string };
    const ref_id: string = (body?.ref_id ?? '').trim();
    const otp: string = (body?.otp ?? '').trim();

    if (!ref_id || !otp) {
      return NextResponse.json({ error: 'ref_id and otp are required' }, { status: 400 });
    }

    const record = buyerOtpStore.get(ref_id);

    if (!record || record.kind !== 'pending') {
      return NextResponse.json({ error: 'Invalid or expired OTP session' }, { status: 400 });
    }

    if (Date.now() > record.expiresAt) {
      buyerOtpStore.delete(ref_id);
      return NextResponse.json({ error: 'OTP has expired. Request a new one.' }, { status: 400 });
    }

    record.attempts += 1;

    if (record.attempts > MAX_ATTEMPTS) {
      buyerOtpStore.delete(ref_id);
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Request a new OTP.' },
        { status: 429 },
      );
    }

    if (record.otp !== otp) {
      return NextResponse.json(
        { error: `Incorrect OTP. ${MAX_ATTEMPTS - record.attempts} attempt(s) remaining.` },
        { status: 400 },
      );
    }

    buyerOtpStore.delete(ref_id);

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

    // Seller wins: if any seller candidates exist, prefer them over buyer candidates.
    // Always auto-mint the first effective candidate — no context selection screen.
    const sellerCandidates = record.candidates.filter((c) => c.kind === 'seller');
    const effectiveCandidates = sellerCandidates.length > 0 ? sellerCandidates : record.candidates;
    const candidate = effectiveCandidates[0];
    const { session, redirect } = await mintCandidateSession(candidate);
    return NextResponse.json({ success: true, redirect, session });
  } catch (err) {
    console.error('[phone-otp/verify] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function mintCandidateSession(
  candidate: LoginOtpCandidate,
): Promise<{ session: unknown; redirect: string }> {
  if (candidate.kind === 'seller') {
    const { session } = await mintSellerSession(
      candidate as LoginOtpCandidate & { kind: 'seller' },
    );
    return { session, redirect: '/dashboard' };
  }

  const { session } = await mintBuyerSession(toBuyerLoginCandidate(candidate));
  return { session, redirect: '/buy/home' };
}
