import { NextRequest, NextResponse } from 'next/server';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { mintBuyerSession, mintSellerSession, toBuyerLoginCandidate, mintBuyerHandoffLink } from '@/lib/server/buyer-access';
import { buyerOtpStore, type LoginOtpCandidate } from '@/lib/server/buyer-otp-store';
import { stampSellerImplicitWhatsappConsent } from '@/lib/server/whatsapp-consent';
import { requirePhoneConsentRedirect } from '@/lib/server/phone-consent';
import { tenantStorefrontHostForRequest, buildStorefrontHandoffUrl } from '@/lib/storefront-host';
import { isCatalogRequest } from '@/lib/server/catalog-request';

/**
 * POST /api/auth/phone-otp/select-context
 * Body: { ref_id: string; kind: 'seller'|'buyer'; tenant_id: string; buyer_id: string|null; role: string }
 * Returns: { success: true; redirect: string; session }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      ref_id?: string;
      kind?: string;
      tenant_id?: string;
      buyer_id?: string | null;
      role?: string;
    };
    const ref_id: string = (body?.ref_id ?? '').trim();
    const kind: string = (body?.kind ?? '').trim();
    const tenant_id: string = (body?.tenant_id ?? '').trim();
    const buyer_id: string | null = body?.buyer_id ?? null;
    const role: string = (body?.role ?? '').trim();

    if (!ref_id || !kind || !tenant_id || !role) {
      return NextResponse.json(
        { error: 'ref_id, kind, tenant_id, and role are required' },
        { status: 400 },
      );
    }

    const record = await buyerOtpStore.get(ref_id);

    if (!record || record.kind !== 'verified') {
      return NextResponse.json(
        { error: 'Context selection session expired. Please log in again.' },
        { status: 400 },
      );
    }

    if (Date.now() > record.expiresAt) {
      await buyerOtpStore.delete(ref_id);
      return NextResponse.json(
        { error: 'Session expired. Please log in again.' },
        { status: 400 },
      );
    }

    const candidate = record.candidates.find((ctx) =>
      ctx.kind === kind
      && ctx.tenant_id === tenant_id
      && ctx.role === role
      && (kind === 'seller' ? ctx.buyer_id === null : ctx.buyer_id === buyer_id),
    );

    if (!candidate) {
      return NextResponse.json(
        { error: 'Selected account is no longer available. Please log in again.' },
        { status: 400 },
      );
    }

    await buyerOtpStore.delete(ref_id);

    if (candidate.kind === 'seller') {
      const { session, user } = await mintSellerSession(
        candidate as LoginOtpCandidate & { kind: 'seller' },
      );
      await stampSellerImplicitWhatsappConsent(candidate.tenant_id, user.id);
      return NextResponse.json({ success: true, redirect: '/dashboard', session });
    }

    const buyerCandidate = toBuyerLoginCandidate(candidate);
    const currentTenantId = request.headers.get('x-verified-tenant-id');
    const onCatalogHost = isCatalogRequest(request);
    const { supabaseAdmin } = await import('@/lib/supabase');

    const recordSessionStart = (): void => {
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
    };

    if (onCatalogHost || currentTenantId !== buyerCandidate.tenant_id) {
      const { hashedToken } = await mintBuyerHandoffLink(buyerCandidate);
      const destinationHost = tenantStorefrontHostForRequest(
        request.headers.get('host') ?? '',
        buyerCandidate.tenant_slug,
      );
      const handoffUrl = buildStorefrontHandoffUrl(destinationHost, hashedToken);

      if (onCatalogHost) {
        const { session } = await mintBuyerSession(buyerCandidate);
        recordSessionStart();
        return NextResponse.json({ success: true, handoff_url: handoffUrl, session });
      }

      return NextResponse.json({ success: true, handoff_url: handoffUrl });
    }

    const { session } = await mintBuyerSession(buyerCandidate);
    recordSessionStart();
    // WhatsApp Broadcast Phase C (§4.8, §9): force first-time buyers through
    // the consent checkbox before /buy/home. Phone-level now — a phone that
    // already consented on any other tenant relationship isn't asked again.
    const redirect = await requirePhoneConsentRedirect(candidate.phone) ?? '/buy/home';
    return NextResponse.json({ success: true, redirect, session });
  } catch (err) {
    console.error('[phone-otp/select-context] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
