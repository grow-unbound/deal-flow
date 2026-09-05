import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { BUYER_ROLES } from '@/constants';
import { findBuyerLoginCandidates } from '@/lib/server/buyer-access';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { resolveWinningPriceListForBuyer } from '@/lib/server/buyer-winning-price-list';
import { resolveCallerPhone } from '@/lib/server/resolve-auth-phone';
import type { BuyerSiblingRow } from '@/types/buyer';

/**
 * GET /api/buyer/siblings
 * Distinct buyer accounts in the current tenant for the logged-in phone (Buy As).
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

    const phone = await resolveCallerPhone(claims.sub, claims.role);
    if (!phone) {
      return NextResponse.json({ error: 'No phone number on file for this account.' }, { status: 400 });
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
