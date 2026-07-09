import { NextRequest, NextResponse } from 'next/server';

import type { BuyerHomeResponse } from '@/lib/buyer-home-types';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { loadBuyerActivityFeed } from '@/lib/server/buyer-activity';
import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';

const RECENT_ORDER_PREVIEW_LIMIT = 20;
const ORDER_AGAIN_PREVIEW_LIMIT = 5;
const PROMOTIONS_PREVIEW_LIMIT = 5;

export async function GET(request: NextRequest): Promise<NextResponse<BuyerHomeResponse | { error: string }>> {
  try {
    const profile = await requireBuyerAccessProfile(request);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    const buyer = profile.buyer;
    if (!buyer) {
      const previewPayload: BuyerHomeResponse = {
        greeting_name: 'Preview',
        open_orders_count: 0,
        summary_card: { gmv_mtd: 0, invoice_count_ytd: 0, trend_vs_last_month_pct: 0 },
        dues_card: { outstanding_dues: 0, open_invoice_count: 0, earliest_due_date: null, days_until_earliest_due: null },
        credit_card: { credit_limit: 0, available_credit: 0, credit_used: 0 },
        order_again_preview: [],
        latest_promotions_preview: [],
        recent_activity: { items: [], next_cursor: null },
        bestsellers: [],
        buy_again: [],
        preview_message: 'Preview mode — buyer-specific numbers show as 0.',
      };
      return NextResponse.json(previewPayload, { headers: BUYER_CACHE_PERSONAL });
    }

    const tenantId = context.tenant_id!;
    const buyerId = buyer.id;
    const allowedTenantBrandIds = await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId);

    void recordBuyerAppActivitySafe(supabaseAdmin as any, {
      tenantId,
      buyerId,
      eventName: 'home_viewed',
      path: request.nextUrl.pathname,
    });

    const [buyerHomeSummaryRes, activity, catalogs, ordersRes] = await Promise.all([
      supabaseAdmin
        .schema('app')
        .rpc('get_buyer_home_summary', {
          p_tenant_id: tenantId,
          p_buyer_id: buyerId,
        }),
      loadBuyerActivityFeed(supabaseAdmin as any, { tenantId, buyerId, limit: 10 }),
      getVisibleBuyerCatalogs(tenantId, buyerId),
      supabaseAdmin
        .schema('app')
        .from('orders')
        .select('id, placed_at')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .order('placed_at', { ascending: false })
        .limit(RECENT_ORDER_PREVIEW_LIMIT),
    ]);

    const queryError =
      buyerHomeSummaryRes.error
      ?? ordersRes.error;
    if (queryError) {
      throw new Error(queryError.message ?? 'Failed to load buyer home');
    }

    const buyerHomeSummaryRow = Array.isArray(buyerHomeSummaryRes.data)
      ? buyerHomeSummaryRes.data[0]
      : buyerHomeSummaryRes.data;
    const buyerHomeSummary = {
      gmv_mtd: Number(buyerHomeSummaryRow?.gmv_mtd ?? 0),
      invoice_count_ytd: Number(buyerHomeSummaryRow?.invoice_count_ytd ?? 0),
      trend_vs_last_month_pct: Number(buyerHomeSummaryRow?.trend_vs_last_month_pct ?? 0),
      outstanding_dues: Number(buyerHomeSummaryRow?.outstanding_dues ?? 0),
      open_invoice_count: Number(buyerHomeSummaryRow?.open_invoice_count ?? 0),
      earliest_due_date: buyerHomeSummaryRow?.earliest_due_date ?? null,
      days_until_earliest_due: buyerHomeSummaryRow?.days_until_earliest_due ?? null,
      credit_limit: Number(buyerHomeSummaryRow?.credit_limit ?? buyer.credit_limit ?? 0),
      available_credit: Number(buyerHomeSummaryRow?.available_credit ?? buyer.credit_limit ?? 0),
      credit_used: Number(buyerHomeSummaryRow?.credit_used ?? 0),
      open_orders_count: Number(buyerHomeSummaryRow?.open_orders_count ?? 0),
    };

    const visibleCatalogs = catalogs;
    const catalogIds = visibleCatalogs.map((catalog) => catalog.id);
    let countByCatalog = new Map<string, number>();
    if (catalogIds.length > 0) {
      const itemsRes = await supabaseAdmin
        .schema('app')
        .from('campaign_items')
        .select('campaign_id, campaigns!inner(tenant_id)')
        .eq('campaigns.tenant_id', tenantId)
        .in('campaign_id', catalogIds)
        .is('deleted_at', null);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      for (const row of (itemsRes.data ?? []) as Array<{ campaign_id: string }>) {
        countByCatalog.set(row.campaign_id, (countByCatalog.get(row.campaign_id) ?? 0) + 1);
      }
    }

    const promotionsPreview = visibleCatalogs
      .slice(0, PROMOTIONS_PREVIEW_LIMIT)
      .map((catalog) => ({
        id: catalog.id,
        name: catalog.name,
        product_count: countByCatalog.get(catalog.id) ?? 0,
        share_token: catalog.share_token,
        valid_until: catalog.valid_to,
        hero_image_url: catalog.hero_image_url ?? null,
      }));

    const recentOrders = (ordersRes.data ?? []) as Array<{ id: string; placed_at: string | null }>;
    const orderIds = recentOrders.map((row) => row.id);
    const recentOrderItemsRes = orderIds.length > 0
      ? await supabaseAdmin
          .schema('app')
          .from('order_items')
          .select('order_id, tenant_product_id, orders!inner(tenant_id, buyer_id)')
          .eq('orders.tenant_id', tenantId)
          .eq('orders.buyer_id', buyerId)
          .in('order_id', orderIds)
          .is('deleted_at', null)
      : { data: [] as Array<{ order_id: string; tenant_product_id: string }>, error: null };
    if (recentOrderItemsRes.error) {
      throw new Error(recentOrderItemsRes.error.message ?? 'Failed to load buyer home order items');
    }
    const previewProductIds = Array.from(
      new Set(((recentOrderItemsRes.data ?? []) as Array<{ order_id: string; tenant_product_id: string }>).map((row) => row.tenant_product_id)),
    ).slice(0, ORDER_AGAIN_PREVIEW_LIMIT);
    const reorderPreviewMap = await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
      tenantId,
      buyerId,
      productIds: previewProductIds,
      allowedTenantBrandIds,
      campaignId: null,
      campaignName: null,
      campaignValidUntil: null,
      priceOverrides: new Map(),
    });

    // Fetch recommendation data (non-blocking — empty arrays on failure)
    let bestsellers: import('@/types/buyer').BuyerCatalogItem[] = [];
    let buyAgain: import('@/types/buyer').BuyerCatalogItem[] = [];
    try {
      const recoRes = await supabaseAdmin
        .schema('app')
        .rpc('reco_get_home', { p_tenant_id: tenantId, p_buyer_id: buyerId });

      if (!recoRes.error && recoRes.data) {
        const recoData = recoRes.data as { bestsellers?: string[]; buy_again?: string[] };
        const bestsellerIds = (recoData.bestsellers ?? []).slice(0, 12);
        const buyAgainIds = (recoData.buy_again ?? []).slice(0, 10);

        const [bestsellerMap, buyAgainMap] = await Promise.all([
          bestsellerIds.length > 0
            ? assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
                tenantId,
                buyerId,
                productIds: bestsellerIds,
                allowedTenantBrandIds,
                campaignId: null,
                campaignName: null,
                campaignValidUntil: null,
                priceOverrides: new Map(),
              })
            : Promise.resolve(new Map<string, import('@/types/buyer').BuyerCatalogItem>()),
          buyAgainIds.length > 0
            ? assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
                tenantId,
                buyerId,
                productIds: buyAgainIds,
                allowedTenantBrandIds,
                campaignId: null,
                campaignName: null,
                campaignValidUntil: null,
                priceOverrides: new Map(),
              })
            : Promise.resolve(new Map<string, import('@/types/buyer').BuyerCatalogItem>()),
        ]);

        bestsellers = bestsellerIds
          .map((id) => bestsellerMap.get(id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
        buyAgain = buyAgainIds
          .map((id) => buyAgainMap.get(id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
      }
    } catch {
      // Recommendation data is non-critical — home page still works without it
    }

    const payload: BuyerHomeResponse = {
      greeting_name: profile.greeting_name ?? buyer.contact_name ?? buyer.business_name,
      open_orders_count: buyerHomeSummary.open_orders_count,
      summary_card: {
        gmv_mtd: Number(buyerHomeSummary.gmv_mtd.toFixed(2)),
        invoice_count_ytd: buyerHomeSummary.invoice_count_ytd,
        trend_vs_last_month_pct: buyerHomeSummary.trend_vs_last_month_pct,
      },
      dues_card: {
        outstanding_dues: buyerHomeSummary.outstanding_dues,
        open_invoice_count: buyerHomeSummary.open_invoice_count,
        earliest_due_date: buyerHomeSummary.earliest_due_date,
        days_until_earliest_due: buyerHomeSummary.days_until_earliest_due,
      },
      credit_card: {
        credit_limit: buyerHomeSummary.credit_limit,
        available_credit: buyerHomeSummary.available_credit,
        credit_used: buyerHomeSummary.credit_used,
      },
      order_again_preview: previewProductIds
        .map((id) => reorderPreviewMap.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      latest_promotions_preview: promotionsPreview,
      recent_activity: activity,
      bestsellers,
      buy_again: buyAgain,
    };

    return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/buyer/home]', error);
    return NextResponse.json({ error: 'Failed to load buyer home' }, { status: 500 });
  }
}
