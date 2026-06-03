import { NextRequest, NextResponse } from 'next/server';
import { otpStore } from '../send/route';

/**
 * POST /api/auth/phone-otp/select-context
 * Body: { ref_id: string; tenant_id: string; role: string }
 * Returns: { success: true; redirect: string }
 *
 * ref_id here is the verified_ref returned by /verify when multiple contexts exist.
 * It starts with "v_" to differentiate from raw OTP ref_ids.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ref_id: string = (body?.ref_id ?? '').trim();
    const tenant_id: string = (body?.tenant_id ?? '').trim();
    const role: string = (body?.role ?? '').trim();

    if (!ref_id || !tenant_id || !role) {
      return NextResponse.json(
        { error: 'ref_id, tenant_id, and role are required' },
        { status: 400 }
      );
    }

    if (!ref_id.startsWith('v_')) {
      return NextResponse.json({ error: 'Invalid context selection token' }, { status: 400 });
    }

    const record = otpStore.get(ref_id);

    if (!record || record.otp !== 'VERIFIED') {
      return NextResponse.json(
        { error: 'Context selection session expired. Please log in again.' },
        { status: 400 }
      );
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(ref_id);
      return NextResponse.json(
        { error: 'Session expired. Please log in again.' },
        { status: 400 }
      );
    }

    // Consume the token
    otpStore.delete(ref_id);

    // TODO: mint a session token or set a cookie for the buyer session here.
    // For now return a redirect to the buyer shop for the selected tenant.
    const redirect = `/shop?tenant=${tenant_id}`;

    return NextResponse.json({ success: true, redirect });
  } catch (err) {
    console.error('[phone-otp/select-context] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
