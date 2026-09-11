import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { findAllLoginCandidates } from '@/lib/server/buyer-access';
import { writeVerifiedCandidatesRecord } from '@/lib/server/buyer-otp-store';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/switch-context
 * Authenticated (session cookie or Bearer token) — no body.
 * Returns: { success: true; contexts: LoginOtpContext[]; ref_id: string }
 * or       { error: string } (400/401/500)
 *
 * Lets an already-logged-in seller/buyer jump straight to the multi-account
 * picker (/login/select-context) without a fresh OTP.
 *
 * SECURITY: the phone driving the candidate lookup MUST be the caller's
 * OTP-verified phone (`user_metadata.otp_verified_phone`, stamped only by a
 * real OTP hash check — see 20260911013323_fix_buyer_signup_rpcs_otp_anchor.sql),
 * never `app.buyers.phone`/`app.buyer_users.phone` (resolveCallerPhone). Those
 * are ordinary mutable business columns with no OTP re-verification on write
 * (PATCH /api/buyer/me can rewrite them to an arbitrary phone, including a
 * victim's, with only a same-tenant uniqueness check) — using them here let
 * an attacker redirect this lookup at a victim's own login candidates.
 *
 * The resulting `verified` OTP-store record is also stamped with the
 * caller's own auth.uid() (`created_by_user_id`) so that only this same
 * caller's own subsequent select-context call can redeem it — see
 * phone-otp/select-context/route.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(claims.sub);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const otpVerifiedPhone = (userData.user.user_metadata as Record<string, unknown> | null)?.otp_verified_phone;
    const phone = typeof otpVerifiedPhone === 'string' && otpVerifiedPhone.trim() ? otpVerifiedPhone : null;
    if (!phone) {
      // Fail closed rather than fall back to a mutable business-column phone
      // lookup — this session predates the OTP-verified-phone claim (or was
      // minted without one). The user must complete a fresh OTP login once
      // to populate it.
      return NextResponse.json(
        { error: 'Please log in again to switch accounts.' },
        { status: 400 },
      );
    }

    const candidates = await findAllLoginCandidates(phone);
    if (candidates.length < 2) {
      return NextResponse.json({ error: 'No other accounts linked to this number.' }, { status: 400 });
    }

    // otpVerified: false — while `phone` here IS the caller's genuinely
    // OTP-verified phone, this call itself is not a fresh OTP challenge.
    // select-context must not stamp otp_verified_phone off the back of this
    // record (unrelated, already-covered concern — see buyer-otp-store.ts).
    const refId = await writeVerifiedCandidatesRecord(phone, candidates, false, claims.sub);
    if (!refId) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, contexts: candidates, ref_id: refId });
  } catch (err) {
    console.error('[switch-context] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
