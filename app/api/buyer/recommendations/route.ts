import { NextRequest, NextResponse } from 'next/server';

import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerProductPageRecos } from '@/lib/buyer-home-types';

const EMPTY: BuyerProductPageRecos = { co_order: [], co_buyer: [], same_category: [] };

export async function GET(request: NextRequest): Promise<NextResponse<BuyerProductPageRecos | { error: string }>> {
  const profile = await requireBuyerAccessProfile(request);
  if (!profile?.context.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const productId = request.nextUrl.searchParams.get('product_id');
  if (!productId) {
    return NextResponse.json({ error: 'product_id required' }, { status: 400 });
  }

  const tenantId = profile.context.tenant_id!;
  const buyerId = profile.buyer?.id ?? null;

  try {
    const allowedTenantBrandIds = buyerId
      ? await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId)
      : [];

    const recoRes = await supabaseAdmin
      .schema('app')
      .rpc('reco_get_product_page', {
        p_tenant_id: tenantId,
        p_tenant_product_id: productId,
        p_buyer_id: buyerId,
        p_widget_types: ['co_order', 'co_buyer', 'same_category'],
        p_limit: 8,
      });

    if (recoRes.error) throw new Error(recoRes.error.message);

    const recoData = recoRes.data as {
      co_order?: string[];
      co_buyer?: string[];
      same_category?: string[];
    } | null;

    if (!recoData) return NextResponse.json(EMPTY, { headers: BUYER_CACHE_CATALOG });

    // Deduplicate product IDs across all carousels before enrichment (single DB round-trip)
    const allIds = Array.from(
      new Set([
        ...(recoData.co_order ?? []),
        ...(recoData.co_buyer ?? []),
        ...(recoData.same_category ?? []),
      ]),
    );

    const enriched =
      allIds.length > 0
        ? await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
            tenantId,
            buyerId,
            productIds: allIds,
            allowedTenantBrandIds,
            campaignId: null,
            campaignName: null,
            campaignValidUntil: null,
            priceOverrides: new Map(),
          })
        : new Map<string, import('@/types/buyer').BuyerCatalogItem>();

    const hydrate = (ids: string[] = []) =>
      ids.map((id) => enriched.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json({
      co_order: hydrate(recoData.co_order),
      co_buyer: hydrate(recoData.co_buyer),
      same_category: hydrate(recoData.same_category),
    }, { headers: BUYER_CACHE_CATALOG });
  } catch (error) {
    console.error('[GET /api/buyer/recommendations]', error);
    // Recommendations are non-critical — return empty rather than 500
    return NextResponse.json(EMPTY, { headers: BUYER_CACHE_CATALOG });
  }
}
