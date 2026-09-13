import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { resolveWinningPriceListForBuyer } from '@/lib/server/buyer-winning-price-list';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerSiblingRow } from '@/types/buyer';

/**
 * GET /api/buyer/siblings
 * Distinct buyer accounts in the current tenant for the logged-in phone (Buy As).
 *
 * SECURITY: the phone driving the candidate lookup MUST be the caller's
 * OTP-verified phone (`app_metadata.otp_verified_phone` — moved out of
 * user_metadata, which is client-writable via the public
 * supabase.auth.updateUser({data:...}) call and was therefore
 * self-forgeable; see 20260913023654_fix_otp_anchor_rpcs_app_metadata.sql),
 * never
 * `app.buyers.phone`/`app.buyer_users.phone` (resolveCallerPhone). Those are
 * ordinary mutable business columns with no OTP re-verification on write
 * (PATCH /api/buyer/me could rewrite them to collide with another same-tenant
 * delegate's `buyer_users.phone`) — using them here let an attacker poison
 * their own phone to make this route disclose another buyer's business_name
 * and assigned price list. Mirrors the fix applied to
 * app/api/auth/switch-buyer/route.ts, with one difference: this is a
 * cosmetic "Buy As" convenience, not a security-critical action, so a
 * missing claim degrades to an empty sibling list instead of failing closed.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.sub || !claims.tenant_id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!claims.role || !(BUYER_ROLES as readonly string[]).includes(claims.role)) {
      return NextResponse.json({ error: 'Buyer session required' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(claims.sub);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const otpVerifiedPhone = (userData.user.app_metadata as Record<string, unknown> | null)?.otp_verified_phone;
    const phone = typeof otpVerifiedPhone === 'string' && otpVerifiedPhone.trim() ? otpVerifiedPhone : null;
    if (!phone) {
      // Degrade gracefully rather than fail closed — the "Buy As" picker is a
      // cosmetic convenience, not a security-critical action. A session that
      // predates the OTP-verified-phone claim simply sees no siblings until
      // the user completes a fresh OTP login.
      return NextResponse.json({ siblings: [] }, { headers: BUYER_CACHE_CATALOG });
    }

    const candidates = await findBuyerLoginCandidates(phone);
    const seen = new Set<string>();
    const siblings: BuyerSiblingRow[] = [];

    for (const candidate of candidates) {
      if (candidate.tenant_id !== claims.tenant_id) continue;
      if (seen.has(candidate.buyer_id)) continue;
      seen.add(candidate.buyer_id);

      const winning = await resolveWinningPriceListForBuyer(claims.tenant_id, candidate.buyer_id);
      siblings.push({
        buyer_id: candidate.buyer_id,
        business_name: candidate.business_name,
        role: candidate.role,
        price_list_id: winning.price_list_id,
        price_list_name: winning.price_list_name,
      });
    }

    return NextResponse.json({ siblings }, { headers: BUYER_CACHE_CATALOG });
  } catch (err) {
    console.error('[GET /api/buyer/siblings]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
