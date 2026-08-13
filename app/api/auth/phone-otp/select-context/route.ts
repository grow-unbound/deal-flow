import { NextRequest, NextResponse } from 'next/server';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { mintBuyerSession, mintSellerSession, toBuyerLoginCandidate } from '@/lib/server/buyer-access';
import { buyerOtpStore, type LoginOtpCandidate } from '@/lib/server/buyer-otp-store';
import { stampSellerImplicitWhatsappConsent } from '@/lib/server/whatsapp-consent';

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
    // WhatsApp Broadcast Phase C (§4.8, §9): force first-time buyers through
    // the consent checkbox before /buy/catalog.
    let redirect = '/buy/catalog';
    if (candidate.buyer_id) {
      const { supabaseAdmin } = await import('@/lib/supabase');
      if (supabaseAdmin) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const { data } = await db
          .schema('app')
          .from('buyers')
          .select('whatsapp_consent_at')
          .eq('id', candidate.buyer_id)
          .maybeSingle();
        if (data && !data.whatsapp_consent_at) redirect = '/consent';
      }
    }
    return NextResponse.json({ success: true, redirect, session });
  } catch (err) {
    console.error('[phone-otp/select-context] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
