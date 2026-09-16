import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { resolveSwitchLookupPhone, restrictCandidatesToAuthenticatedUser } from '@/lib/server/auth-switch-phone';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { resolveWinningPriceListForBuyer } from '@/lib/server/buyer-winning-price-list';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerSiblingRow } from '@/types/buyer';

/**
 * GET /api/buyer/siblings
 * Distinct buyer accounts in the current tenant for the logged-in phone (Buy As).
 *
 * SECURITY: prefer the caller's OTP-verified phone
 * (`app_metadata.otp_verified_phone`). Legacy authenticated sessions may fall
 * back to the auth identity's phone, but those results are restricted to
 * candidates already linked to the same auth user id. Never use
 * `app.buyers.phone`/`app.buyer_users.phone` (resolveCallerPhone) for broad
 * candidate lookup: those are mutable business columns with no OTP
 * re-verification on write. A missing usable phone still degrades to an empty
 * sibling list instead of failing the page.
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

    const lookup = resolveSwitchLookupPhone(userData.user);
    if (!lookup) {
      // Degrade gracefully rather than fail closed — the "Buy As" picker is a
      // cosmetic convenience, not a security-critical action.
      return NextResponse.json({ siblings: [] }, { headers: BUYER_CACHE_CATALOG });
    }

    const candidates = restrictCandidatesToAuthenticatedUser(
      await findBuyerLoginCandidates(lookup.phone),
      claims,
      lookup,
    );
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
