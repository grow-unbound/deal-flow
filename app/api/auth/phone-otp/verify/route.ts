import { NextRequest, NextResponse } from 'next/server';
import { getPostHogClient } from '@/lib/posthog-server';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { mintBuyerSession, mintSellerSession, toBuyerLoginCandidate, acquireBuyerForStorefront, mintBuyerHandoffLink } from '@/lib/server/buyer-access';
import { buyerOtpStore, writeVerifiedCandidatesRecord, hashOtp, type LoginOtpCandidate } from '@/lib/server/buyer-otp-store';
import { stampSellerImplicitWhatsappConsent } from '@/lib/server/whatsapp-consent';
import { requirePhoneConsentRedirect } from '@/lib/server/phone-consent';
import { tenantStorefrontHostForRequest, buildStorefrontHandoffUrl, safeReturnToPath } from '@/lib/storefront-host';
import { buildRequestAccessMessage } from '@/constants/auth-login-copy';
import { isCatalogRequest } from '@/lib/server/catalog-request';
import {
  filterBuyerCandidatesForReturnTo,
  pickPreferredBuyerCandidate,
} from '@/lib/server/catalog-return-to';

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
    const body = await request.json() as { ref_id?: string; otp?: string; return_to?: string };
    const ref_id: string = (body?.ref_id ?? '').trim();
    const otp: string = (body?.otp ?? '').trim();
    const returnTo = body?.return_to?.trim() || null;

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

    // record.otp holds sha256(otp) for sessions created after the hash-at-rest
    // migration; the plaintext fallback covers any session still in flight from
    // just before that deploy (10-minute TTL, so this window is short-lived).
    if (record.otp !== hashOtp(otp) && record.otp !== otp) {
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
      const onCatalogHost = isCatalogRequest(request);
      if (onCatalogHost && returnTo) {
        const tenantScoped = filterBuyerCandidatesForReturnTo(effectiveCandidates, returnTo);
        if (tenantScoped.length > 0) {
          const candidate = pickPreferredBuyerCandidate(tenantScoped);
          return buildMintedCandidateResponse(request, candidate, returnTo);
        }
      }

      const verifiedRefId = await writeVerifiedCandidatesRecord(record.phone, effectiveCandidates);
      if (!verifiedRefId) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      return NextResponse.json({ success: true, contexts: effectiveCandidates, ref_id: verifiedRefId });
    }

    const candidate = effectiveCandidates[0];
    return buildMintedCandidateResponse(request, candidate, returnTo);
  } catch (err) {
    console.error('[phone-otp/verify] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function buildMintedCandidateResponse(
  request: NextRequest,
  candidate: LoginOtpCandidate,
  returnTo: string | null,
): Promise<NextResponse> {
  const result = await mintCandidateSession(request, candidate, returnTo);
  if (result.pending) {
    return NextResponse.json({
      success: false,
      outcome: 'pending_approval',
      message: result.message,
      seller_name: result.sellerName,
      seller_whatsapp_number: result.sellerWhatsappNumber,
    });
  }
  if ('handoffUrl' in result) {
    if ('session' in result && result.session) {
      return NextResponse.json({
        success: true,
        handoff_url: result.handoffUrl,
        session: result.session,
      });
    }
    return NextResponse.json({ success: true, handoff_url: result.handoffUrl });
  }
  return NextResponse.json({ success: true, redirect: result.redirect, session: result.session });
}

type MintResult =
  | { pending: false; session: unknown; redirect: string }
  | { pending: false; handoffUrl: string; session?: unknown }
  | { pending: true; message: string; sellerName: string; sellerWhatsappNumber: string | null };

async function mintCandidateSession(
  request: NextRequest,
  candidate: LoginOtpCandidate,
  returnTo: string | null = null,
): Promise<MintResult> {
  if (candidate.kind === 'seller') {
    const { session, user } = await mintSellerSession(
      candidate as LoginOtpCandidate & { kind: 'seller' },
    );
    await stampSellerImplicitWhatsappConsent(candidate.tenant_id, user.id);
    return { pending: false, session, redirect: '/dashboard' };
  }

  const storefrontHome = request.headers.get('x-verified-tenant-id') ? '/' : '/buy/home';
  const buyerCandidate = candidate.buyer_id
    ? toBuyerLoginCandidate(candidate)
    : await acquireBuyerForStorefront(candidate.tenant_id, candidate.phone);

  // Fresh self-registration (or a still-suspended known buyer) — do not mint
  // a session. custom_access_token_hook would only return empty claims for
  // it anyway (AND b.buyer_app_enabled = true), so a session here would just
  // be a useless cookie; better to tell the buyer plainly that approval is
  // pending, same messaging pattern phone-otp/send already uses for blocked
  // candidates.
  if (!buyerCandidate.buyer_app_enabled) {
    const sellerName = buyerCandidate.tenant_name || 'the seller';
    const buyerName = buyerCandidate.contact_name?.trim() || buyerCandidate.business_name || null;
    return {
      pending: true,
      message: buildRequestAccessMessage({ sellerName, buyerName }),
      sellerName,
      sellerWhatsappNumber: buyerCandidate.tenant_whatsapp_number ?? null,
    };
  }

  const currentTenantId = request.headers.get('x-verified-tenant-id');
  const onCatalogHost = isCatalogRequest(request);

  if (currentTenantId !== buyerCandidate.tenant_id) {
    const destinationHost = tenantStorefrontHostForRequest(
      request.headers.get('host') ?? '',
      buyerCandidate.tenant_slug,
    );
    const returnPath = safeReturnToPath(returnTo, destinationHost);

    if (onCatalogHost) {
      const { session } = await mintBuyerSession(buyerCandidate);
      const { supabaseAdmin } = await import('@/lib/supabase');
      if (supabaseAdmin && buyerCandidate.buyer_id) {
        void recordBuyerAppActivitySafe(supabaseAdmin as any, {
          tenantId: buyerCandidate.tenant_id,
          buyerId: buyerCandidate.buyer_id,
          eventName: 'session_started',
          path: request.nextUrl.pathname,
          context: {
            role: buyerCandidate.role,
            principal_type: buyerCandidate.principal_type,
          },
        });
      }

      if (returnPath) {
        const { hashedToken } = await mintBuyerHandoffLink(buyerCandidate);
        const handoffUrl = buildStorefrontHandoffUrl(destinationHost, hashedToken, returnTo);
        return { pending: false, handoffUrl, session };
      }

      const redirect = await requirePhoneConsentRedirect(buyerCandidate.phone) ?? '/';
      return { pending: false, session, redirect };
    }

    const { hashedToken } = await mintBuyerHandoffLink(buyerCandidate);
    const handoffUrl = buildStorefrontHandoffUrl(destinationHost, hashedToken, returnTo);
    return { pending: false, handoffUrl };
  }

  const { session } = await mintBuyerSession(buyerCandidate);
  const { supabaseAdmin } = await import('@/lib/supabase');
  if (supabaseAdmin && buyerCandidate.buyer_id) {
    void recordBuyerAppActivitySafe(supabaseAdmin as any, {
      tenantId: buyerCandidate.tenant_id,
      buyerId: buyerCandidate.buyer_id,
      eventName: 'session_started',
      path: request.nextUrl.pathname,
      context: {
        role: buyerCandidate.role,
        principal_type: buyerCandidate.principal_type,
      },
    });
  }
  const redirect = await requirePhoneConsentRedirect(buyerCandidate.phone) ?? storefrontHome;
  return { pending: false, session, redirect };
}
