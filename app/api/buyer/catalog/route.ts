import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { recordCampaignView } from '@/lib/server/campaign-engagement';
import { fetchBuyerCatalogPage, resolveBuyerCatalogContext } from '@/lib/server/buyer-product-data';
import type { BuyerCatalogResponse } from '@/types/buyer';

const PAGE_LIMIT = 40;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryId = searchParams.get('category_id')?.trim() ?? '';
    const brandId = searchParams.get('brand_id')?.trim() ?? '';
    const tenantProductId = searchParams.get('tenant_product_id')?.trim() ?? '';
    const requestedCampaignId = searchParams.get('campaign_id')?.trim() ?? '';
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? PAGE_LIMIT)), 100);
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

    const context = await resolveBuyerCatalogContext(supabaseAdmin as any, req, profile);
    if (context.buyerId) {
      void recordBuyerAppActivitySafe(supabaseAdmin as any, {
        tenantId: context.tenantId,
        buyerId: context.buyerId,
        eventName: 'catalog_viewed',
        path: req.nextUrl.pathname,
        context: {
          campaign_id: req.nextUrl.searchParams.get('campaign_id')?.trim() ?? null,
          search: req.nextUrl.searchParams.get('search')?.trim() ?? null,
        },
      });
    }
    const response = await fetchBuyerCatalogPage({
      db: supabaseAdmin as any,
      tenantId: context.tenantId,
      buyerId: context.buyerId,
      allowedTenantBrandIds: context.allowedTenantBrandIds,
      inventoryWarehouseId: context.inventoryWarehouseId,
      visibleCampaigns: context.visibleCampaigns,
      search,
      categoryId,
      brandId,
      tenantProductId,
      requestedCampaignId,
      limit,
      offset,
    });

    if (offset === 0 && context.buyerId && response.selected_campaign_id) {
      await recordCampaignView(supabaseAdmin, {
        tenantId: context.tenantId,
        buyerId: context.buyerId,
        campaignId: response.selected_campaign_id,
        source: 'buyer_app',
      });
    }

    return NextResponse.json({
      ...response,
      catalogs: context.catalogs,
    } satisfies BuyerCatalogResponse, { headers: BUYER_CACHE_CATALOG });
  } catch (error) {
    console.error('[GET /api/buyer/catalog]', error);
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  }
}
