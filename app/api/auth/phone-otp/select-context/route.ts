import { NextRequest, NextResponse } from 'next/server';
import { mintBuyerSession, mintSellerSession, toBuyerLoginCandidate } from '@/lib/server/buyer-access';
import { buyerOtpStore, type LoginOtpCandidate } from '@/lib/server/buyer-otp-store';

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

    if (!ref_id.startsWith('v_')) {
      return NextResponse.json({ error: 'Invalid context selection token' }, { status: 400 });
    }

    const record = buyerOtpStore.get(ref_id);

    if (!record || record.kind !== 'verified') {
      return NextResponse.json(
        { error: 'Context selection session expired. Please log in again.' },
        { status: 400 },
      );
    }

    if (Date.now() > record.expiresAt) {
      buyerOtpStore.delete(ref_id);
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

    buyerOtpStore.delete(ref_id);

    if (candidate.kind === 'seller') {
      const { session } = await mintSellerSession(
        candidate as LoginOtpCandidate & { kind: 'seller' },
      );
      return NextResponse.json({ success: true, redirect: '/dashboard', session });
    }

    const { session } = await mintBuyerSession(toBuyerLoginCandidate(candidate));
    return NextResponse.json({ success: true, redirect: '/buy/home', session });
  } catch (err) {
    console.error('[phone-otp/select-context] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
