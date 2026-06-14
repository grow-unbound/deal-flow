import { NextRequest, NextResponse } from 'next/server';
import { getPostHogClient } from '@/lib/posthog-server';
import { mintBuyerSession } from '@/lib/server/buyer-access';
import { buyerOtpStore, type BuyerOtpContext } from '@/lib/server/buyer-otp-store';

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/phone-otp/verify
 * Body: { ref_id: string; otp: string }
 * Returns:
 *   single context  → { success: true; redirect: string; session }
 *   multi  contexts → { success: true; contexts: BuyerOtpContext[]; ref_id: string }
 *   error           → { error: string } with appropriate status
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
        { error: 'No buyer account found for this number.' },
        { status: 403 },
      );
    }

    const contexts: BuyerOtpContext[] = record.candidates.map((candidate) => ({
      tenant_id: candidate.tenant_id,
      tenant_name: candidate.tenant_name,
      tenant_slug: candidate.tenant_slug,
      buyer_id: candidate.buyer_id,
      role: candidate.role,
    }));

    const verified_ref = `v_${ref_id}`;
    buyerOtpStore.set(verified_ref, {
      kind: 'verified',
      phone: record.phone,
      expiresAt: Date.now() + 5 * 60 * 1000,
      candidates: record.candidates,
    });

    try {
      const ph = getPostHogClient();
      const ctx = contexts[0];
      ph.capture({
        distinctId: ctx.buyer_id,
        event: 'buyer_otp_verified',
        properties: {
          tenant_count: contexts.length,
          tenant_id: ctx.tenant_id,
          role: ctx.role,
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    if (record.candidates.length === 1) {
      buyerOtpStore.delete(verified_ref);
      const { session } = await mintBuyerSession(record.candidates[0]);
      return NextResponse.json({
        success: true,
        redirect: '/shop/home',
        session,
      });
    }

    return NextResponse.json({
      success: true,
      contexts,
      ref_id: verified_ref,
    });
  } catch (err) {
    console.error('[phone-otp/verify] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
