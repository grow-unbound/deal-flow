import { NextRequest, NextResponse } from 'next/server';

import type { BuyerHomeResponse } from '@/lib/buyer-home-types';
import { BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';
import { loadBuyerActivityFeed } from '@/lib/server/buyer-activity';
import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { recordBuyerAppActivitySafe } from '@/lib/server/buyer-app-activity';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';
import { hasInvoiceReceivableExposure } from '@/lib/invoice-status';

const RECENT_ORDER_PREVIEW_LIMIT = 20;
const ORDER_AGAIN_PREVIEW_LIMIT = 5;
const PROMOTIONS_PREVIEW_LIMIT = 5;
const OPEN_ORDER_STATUSES = new Set(['draft', 'received', 'confirmed', 'partially_dispatched', 'dispatched']);

function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfYearUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function addMonthsUtc(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

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
        summary_card: { gmv_mtd: 0, gmv_ytd: 0, invoice_count_ytd: 0, trend_vs_last_month_pct: 0 },
        dues_card: { outstanding_dues: 0, open_invoice_count: 0, earliest_due_date: null, days_until_earliest_due: null },
        credit_card: { credit_limit: 0, available_credit: 0, credit_used: 0 },
        order_again_preview: [],
        latest_promotions_preview: [],
        recent_activity: { items: [], next_cursor: null },
        bestsellers: [],
        preview_message: 'Preview mode — buyer-specific numbers show as 0.',
        as_of: new Date().toISOString(),
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

    const now = new Date();
    const currentMonthStart = startOfMonthUtc(now);
    const nextMonthStart = addMonthsUtc(currentMonthStart, 1);
    const previousMonthStart = addMonthsUtc(currentMonthStart, -1);
    const currentYearStart = startOfYearUtc(now);
    // Widest of "previous month" or "year start" — covers MTD/YTD/trend in one
    // date-bounded query instead of an arbitrary row-count LIMIT (which silently
    // truncates YTD/open-invoice figures for any buyer with more than N invoices/year).
    const financialWindowStart = previousMonthStart < currentYearStart ? previousMonthStart : currentYearStart;

    const [buyerMetricsRes, activity, catalogs, ordersRes, invoicesRes, estimatesRes, financialInvoicesRes] = await Promise.all([
      supabaseAdmin
        .schema('app')
        .from('metrics_buyer_snapshot')
        .select('receivable_amount, overdue_amount, oldest_due_at, credit_limit, credit_available')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .maybeSingle(),
      loadBuyerActivityFeed(supabaseAdmin as any, { tenantId, buyerId, limit: 10 }),
      getVisibleBuyerCatalogs(tenantId, buyerId),
      supabaseAdmin
        .schema('app')
        .from('orders')
        .select('id, placed_at, status')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .order('placed_at', { ascending: false })
        .limit(RECENT_ORDER_PREVIEW_LIMIT),
      // Invoices: highest-weight signal for "order again"
      supabaseAdmin
        .schema('app')
        .from('invoices')
        .select('id, invoice_date, total_amount, outstanding_balance, due_date, status')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .order('invoice_date', { ascending: false })
        .limit(RECENT_ORDER_PREVIEW_LIMIT),
      // Estimates not yet converted to order or invoice
      supabaseAdmin
        .schema('app')
        .from('estimates')
        .select('id, created_at')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .is('converted_to_invoice_id', null)
        .is('converted_to_order_id', null)
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDER_PREVIEW_LIMIT),
      // Financial figures (MTD/YTD/trend/open-invoice posture): date-bounded, not
      // row-count-bounded — a buyer with >20 invoices/year must not silently
      // under-report YTD from a 20-row preview window.
      supabaseAdmin
        .schema('app')
        .from('invoices')
        .select('id, invoice_date, total_amount, outstanding_balance, due_date, status')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .gte('invoice_date', financialWindowStart.toISOString())
        .lt('invoice_date', nextMonthStart.toISOString()),
    ]);

    const queryError =
      buyerMetricsRes.error
      ?? ordersRes.error
      ?? invoicesRes.error
      ?? estimatesRes.error
      ?? financialInvoicesRes.error;
    if (queryError) {
      throw new Error(queryError.message ?? 'Failed to load buyer home');
    }

    const buyerMetrics = buyerMetricsRes.data;
    const recentOrders = (ordersRes.data ?? []) as Array<{ id: string; placed_at: string | null; status: string | null }>;
    const recentInvoices = (invoicesRes.data ?? []) as Array<{
      id: string;
      invoice_date: string | null;
      total_amount: number | null;
      outstanding_balance: number | null;
      due_date: string | null;
      status: string | null;
    }>;
    const recentEstimates = (estimatesRes.data ?? []) as Array<{ id: string; created_at: string | null }>;
    const financialInvoices = (financialInvoicesRes.data ?? []) as Array<{
      id: string;
      invoice_date: string | null;
      total_amount: number | null;
      outstanding_balance: number | null;
      due_date: string | null;
      status: string | null;
    }>;

    const gmvMtd = financialInvoices
      .filter((row) => {
        if (!row.invoice_date) return false;
        const ts = new Date(row.invoice_date).getTime();
        return ts >= currentMonthStart.getTime() && ts < nextMonthStart.getTime();
      })
      .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const gmvPreviousMonth = financialInvoices
      .filter((row) => {
        if (!row.invoice_date) return false;
        const ts = new Date(row.invoice_date).getTime();
        return ts >= previousMonthStart.getTime() && ts < currentMonthStart.getTime();
      })
      .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const gmvYtd = financialInvoices
      .filter((row) => {
        if (!row.invoice_date) return false;
        const ts = new Date(row.invoice_date).getTime();
        return ts >= currentYearStart.getTime() && ts < nextMonthStart.getTime();
      })
      .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const invoiceCountYtd = financialInvoices.filter((row) => {
      if (!row.invoice_date) return false;
      const ts = new Date(row.invoice_date).getTime();
      return ts >= currentYearStart.getTime() && ts < nextMonthStart.getTime();
    }).length;
    const trendVsLastMonthPct = gmvPreviousMonth > 0
      ? Math.round(((gmvMtd - gmvPreviousMonth) / gmvPreviousMonth) * 100)
      : gmvMtd > 0 ? 100 : 0;
    // Open invoices within the fetched window are a lower bound only (the window
    // is ~12-13 months); the snapshot's oldest_due_at is the authoritative
    // all-time value and takes priority when present.
    const openInvoiceRows = financialInvoices.filter((row) => hasInvoiceReceivableExposure({
      status: String(row.status ?? ''),
      outstanding_balance: row.outstanding_balance,
    }));
    const earliestDueDateFromWindow = openInvoiceRows
      .map((row) => row.due_date)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
    const earliestDueDate = buyerMetrics?.oldest_due_at ?? earliestDueDateFromWindow;
    const daysUntilEarliestDue = earliestDueDate
      ? Math.ceil((new Date(earliestDueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const buyerHomeSummary = {
      gmv_mtd: gmvMtd,
      gmv_ytd: gmvYtd,
      invoice_count_ytd: invoiceCountYtd,
      trend_vs_last_month_pct: trendVsLastMonthPct,
      outstanding_dues: Number(buyerMetrics?.receivable_amount ?? openInvoiceRows.reduce((sum, row) => sum + Number(row.outstanding_balance ?? 0), 0)),
      open_invoice_count: openInvoiceRows.length,
      earliest_due_date: earliestDueDate,
      days_until_earliest_due: daysUntilEarliestDue,
      credit_limit: Number(buyerMetrics?.credit_limit ?? buyer.credit_limit ?? 0),
      available_credit: Number(buyerMetrics?.credit_available ?? buyer.credit_limit ?? 0),
      credit_used: Number(
        (buyerMetrics?.credit_limit != null && buyerMetrics?.credit_available != null)
          ? Number(buyerMetrics.credit_limit) - Number(buyerMetrics.credit_available)
          : buyerMetrics?.receivable_amount ?? 0,
      ),
      open_orders_count: recentOrders.filter((row) => OPEN_ORDER_STATUSES.has(String(row.status ?? ''))).length,
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

    // Gather items from all three sources in parallel then merge
    type EventSourceItem = { tenant_product_id: string; event_date: string; priority: number };

    const [orderItemsRes, invoiceItemsRes, estimateItemsRes] = await Promise.all([
      recentOrders.length > 0
        ? supabaseAdmin
            .schema('app')
            .from('order_items')
            .select('order_id, tenant_product_id, orders!inner(tenant_id, buyer_id)')
            .eq('orders.tenant_id', tenantId)
            .eq('orders.buyer_id', buyerId)
            .in('order_id', recentOrders.map((r) => r.id))
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ order_id: string; tenant_product_id: string }>, error: null }),
      recentInvoices.length > 0
        ? supabaseAdmin
            .schema('app')
            .from('invoice_items')
            .select('invoice_id, tenant_product_id, invoices!inner(tenant_id, buyer_id)')
            .eq('invoices.tenant_id', tenantId)
            .eq('invoices.buyer_id', buyerId)
            .in('invoice_id', recentInvoices.map((r) => r.id))
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ invoice_id: string; tenant_product_id: string }>, error: null }),
      recentEstimates.length > 0
        ? supabaseAdmin
            .schema('app')
            .from('estimate_items')
            .select('estimate_id, tenant_product_id, estimates!inner(tenant_id, buyer_id)')
            .eq('estimates.tenant_id', tenantId)
            .eq('estimates.buyer_id', buyerId)
            .in('estimate_id', recentEstimates.map((r) => r.id))
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ estimate_id: string; tenant_product_id: string }>, error: null }),
    ]);

    if (orderItemsRes.error) throw new Error(orderItemsRes.error.message ?? 'Failed to load order items');
    if (invoiceItemsRes.error) throw new Error(invoiceItemsRes.error.message ?? 'Failed to load invoice items');
    if (estimateItemsRes.error) throw new Error(estimateItemsRes.error.message ?? 'Failed to load estimate items');

    // Build lookup: source_id → event_date for fast join
    const orderDateById = new Map(recentOrders.map((r) => [r.id, r.placed_at ?? '']));
    const invoiceDateById = new Map(recentInvoices.map((r) => [r.id, r.invoice_date ?? '']));
    const estimateDateById = new Map(recentEstimates.map((r) => [r.id, r.created_at ?? '']));

    // Merge all events: invoices first (priority 1), orders (2), estimates (3)
    // Sort descending by event_date then priority; first occurrence of a product wins.
    const allEvents: EventSourceItem[] = [
      ...((invoiceItemsRes.data ?? []) as Array<{ invoice_id: string; tenant_product_id: string }>).map((row) => ({
        tenant_product_id: row.tenant_product_id,
        event_date: invoiceDateById.get(row.invoice_id) ?? '',
        priority: 1,
      })),
      ...((orderItemsRes.data ?? []) as Array<{ order_id: string; tenant_product_id: string }>).map((row) => ({
        tenant_product_id: row.tenant_product_id,
        event_date: orderDateById.get(row.order_id) ?? '',
        priority: 2,
      })),
      ...((estimateItemsRes.data ?? []) as Array<{ estimate_id: string; tenant_product_id: string }>).map((row) => ({
        tenant_product_id: row.tenant_product_id,
        event_date: estimateDateById.get(row.estimate_id) ?? '',
        priority: 3,
      })),
    ];

    allEvents.sort((a, b) => {
      if (b.event_date !== a.event_date) return b.event_date.localeCompare(a.event_date);
      return a.priority - b.priority;
    });

    const seen = new Set<string>();
    const previewProductIds: string[] = [];
    for (const ev of allEvents) {
      if (!seen.has(ev.tenant_product_id)) {
        seen.add(ev.tenant_product_id);
        previewProductIds.push(ev.tenant_product_id);
        if (previewProductIds.length >= ORDER_AGAIN_PREVIEW_LIMIT) break;
      }
    }
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
    try {
      const recoRes = await supabaseAdmin
        .schema('app')
        .rpc('reco_get_home', { p_tenant_id: tenantId, p_buyer_id: buyerId });

      if (!recoRes.error && recoRes.data) {
        const recoData = recoRes.data as { bestsellers?: string[] };
        const bestsellerIds = (recoData.bestsellers ?? []).slice(0, 12);

        const [bestsellerMap] = await Promise.all([
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
        ]);

        bestsellers = bestsellerIds
          .map((id) => bestsellerMap.get(id))
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
        gmv_ytd: Number(buyerHomeSummary.gmv_ytd.toFixed(2)),
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
      as_of: now.toISOString(),
    };

    return NextResponse.json(payload, { headers: BUYER_CACHE_PERSONAL });
  } catch (error) {
    console.error('[GET /api/buyer/home]', error);
    return NextResponse.json({ error: 'Failed to load buyer home' }, { status: 500 });
  }
}
