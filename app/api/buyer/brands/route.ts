import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_CATALOG, BUYER_CACHE_PRICED } from '@/lib/server/buyer-cache-headers';
import {
  fetchBuyerBrands,
  fetchCachedBuyerBrands,
  fetchCachedGuestBrands,
  resolveBuyerProductScopeContext,
} from '@/lib/server/buyer-product-data';
import type { BuyerBrandsResponse } from '@/types/buyer';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveBuyerProductScopeContext(supabaseAdmin as any, req, profile);
    const requestedCampaignId = req.nextUrl.searchParams.get('campaign_id')?.trim() ?? '';
    const shareToken = req.nextUrl.searchParams.get('share_token')?.trim() ?? '';
    const isDefaultBrowse = !requestedCampaignId && !shareToken;
    const brands = !isDefaultBrowse
      ? await fetchBuyerBrands({
          db: supabaseAdmin as any,
          tenantId: context.tenantId,
          allowedTenantBrandIds: context.allowedTenantBrandIds,
          requestedCampaignId,
          shareToken,
        })
      : profile.context.mode === 'guest'
        ? await fetchCachedGuestBrands(context.tenantId)
        : await fetchCachedBuyerBrands(context.tenantId, context.allowedTenantBrandIds);

    const cacheHeaders = profile.context.mode === 'guest' ? BUYER_CACHE_CATALOG : BUYER_CACHE_PRICED;
    return NextResponse.json({ brands } satisfies BuyerBrandsResponse, { headers: cacheHeaders });
  } catch (err) {
    console.error('[GET /api/buyer/brands]', err);
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
  }
}
