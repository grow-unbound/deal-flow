import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import {
  findBuyerLoginCandidates,
  mintBuyerSession,
} from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';

const SwitchBuyerSchema = z.object({
  buyer_id: z.string().uuid(),
});

/**
 * POST /api/auth/switch-buyer
 * Remint buyer JWT for another buyer_id in the same tenant (Buy As).
 *
 * SECURITY: the phone driving the candidate lookup MUST be the caller's
 * OTP-verified phone (`user_metadata.otp_verified_phone`, stamped only by a
 * real OTP hash check — see 20260911013323_fix_buyer_signup_rpcs_otp_anchor.sql),
 * never `app.buyers.phone`/`app.buyer_users.phone` (resolveCallerPhone). Those
 * are ordinary mutable business columns with no OTP re-verification on write
 * (PATCH /api/buyer/me can rewrite them, including to collide with another
 * same-tenant delegate's `buyer_users.phone`, with only a same-tenant
 * uniqueness check) — using them here let an attacker poison their own phone
 * to match a victim delegate's login-candidate phone, then call this route to
 * mint a full session as that delegate with zero OTP. Mirrors the fix already
 * applied to app/api/auth/switch-context/route.ts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub || !claims.tenant_id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!claims.role || !(BUYER_ROLES as readonly string[]).includes(claims.role)) {
      return NextResponse.json({ error: 'Buyer session required' }, { status: 403 });
    }

    const parsed = SwitchBuyerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'buyer_id is required' }, { status: 400 });
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

    const candidates = await findBuyerLoginCandidates(phone);
    const match = candidates.find(
      (candidate) =>
        candidate.tenant_id === claims.tenant_id
        && candidate.buyer_id === parsed.data.buyer_id,
    );

    if (!match) {
      return NextResponse.json({ error: 'Selected buyer is not available in this tenant.' }, { status: 403 });
    }

    const { session } = await mintBuyerSession(match);

    return NextResponse.json({ session });
  } catch (err) {
    console.error('[POST /api/auth/switch-buyer]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
