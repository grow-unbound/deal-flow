import { NextRequest, NextResponse } from 'next/server';

import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerCatalogItem } from '@/types/buyer';

export const dynamic = 'force-dynamic';

const LIMIT = 8;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<BuyerCatalogItem[] | { error: string }>> {
  const profile = await requireBuyerAccessProfile(request);
  if (!profile?.context.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id: categoryId } = await params;
  const tenantId = profile.context.tenant_id!;
  const buyerId = profile.buyer?.id ?? null;

  try {
    const { data: rpcData, error: rpcErr } = await supabaseAdmin
      .schema('app')
      .rpc('reco_get_bestsellers', {
        p_tenant_id: tenantId,
        p_category_id: categoryId,
        p_limit: LIMIT,
      });

    if (rpcErr) throw new Error(rpcErr.message);

    const rows = (rpcData as { tenant_product_id: string }[] | null) ?? [];
    if (rows.length === 0) return NextResponse.json([], { headers: BUYER_CACHE_CATALOG });

    const productIds = rows.map((r) => r.tenant_product_id);

    const allowedTenantBrandIds = buyerId
      ? await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId)
      : [];

    const enriched = await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
      tenantId,
      buyerId,
      productIds,
      allowedTenantBrandIds,
      campaignId: null,
      campaignName: null,
      campaignValidUntil: null,
      priceOverrides: new Map(),
    });

    // Return in RPC's weighted_score order
    const items = productIds.map((id) => enriched.get(id)).filter((x): x is BuyerCatalogItem => x != null);

    return NextResponse.json(items, { headers: BUYER_CACHE_CATALOG });
  } catch (error) {
    console.error('[GET /api/buyer/reco/category]', error);
    return NextResponse.json([]);
  }
}
