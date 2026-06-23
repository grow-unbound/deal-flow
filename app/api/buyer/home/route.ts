import { NextRequest, NextResponse } from 'next/server';

import type { BuyerHomeResponse } from '@/lib/buyer-home-types';
import { loadBuyerActivityFeed } from '@/lib/server/buyer-activity';
import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { supabaseAdmin } from '@/lib/supabase';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, date.getDate());
}

function formatMonthDayBoundary(date: Date): string {
  return date.toISOString();
}

function growthPct(current: number, previous: number): number {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? 100 : 0;
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
    if (context.mode === 'preview' || !buyer) {
      const previewPayload: BuyerHomeResponse = {
        greeting_name: 'Preview',
        open_orders_count: 0,
        summary_card: { gmv_mtd: 0, invoice_count_ytd: 0, trend_vs_last_month_pct: 0 },
        dues_card: { outstanding_dues: 0, open_invoice_count: 0, earliest_due_date: null, days_until_earliest_due: null },
        credit_card: { credit_limit: 0, available_credit: 0, credit_used: 0 },
        order_again_preview: [],
        latest_promotions_preview: [],
        recent_activity: { items: [], next_cursor: null },
        preview_message: 'Preview mode — buyer-specific numbers show as 0.',
      };
      return NextResponse.json(previewPayload);
    }

    const tenantId = context.tenant_id!;
    const buyerId = buyer.id;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(addMonths(now, -1));
    const prevMonthComparisonEnd = new Date(prevMonthStart);
    prevMonthComparisonEnd.setDate(prevMonthComparisonEnd.getDate() + (now.getDate() - 1));
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [credit, activity, catalogs, invoicesRes, ytdInvoicesRes, ordersRes, orderItemsRes] = await Promise.all([
      loadBuyerCreditSnapshot(supabaseAdmin as any, {
        tenantId,
        buyerId,
        creditLimit: Number(buyer.credit_limit ?? 0),
      }),
      loadBuyerActivityFeed(supabaseAdmin as any, { tenantId, buyerId, limit: 10 }),
      getVisibleBuyerCatalogs(tenantId, buyerId),
      supabaseAdmin
        .schema('app')
        .from('invoices')
        .select('id, total_amount, invoice_date, status')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .neq('status', 'draft'),
      supabaseAdmin
        .schema('app')
        .from('invoices')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .gte('invoice_date', formatMonthDayBoundary(yearStart))
        .is('deleted_at', null)
        .neq('status', 'draft'),
      supabaseAdmin
        .schema('app')
        .from('orders')
        .select('id, status, placed_at')
        .eq('tenant_id', tenantId)
        .eq('buyer_id', buyerId)
        .is('deleted_at', null)
        .order('placed_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .schema('app')
        .from('order_items')
        .select('order_id, tenant_product_id')
        .is('deleted_at', null),
    ]);

    const queryError =
      invoicesRes.error
      ?? ytdInvoicesRes.error
      ?? ordersRes.error
      ?? orderItemsRes.error;
    if (queryError) {
      throw new Error(queryError.message ?? 'Failed to load buyer home');
    }

    const invoiceRows = (invoicesRes.data ?? []) as Array<{
      id: string;
      total_amount: number | null;
      invoice_date: string | null;
      status: string;
    }>;
    let gmvMtd = 0;
    let gmvPrevWindow = 0;
    for (const row of invoiceRows) {
      if (!row.invoice_date) continue;
      const invoiceDate = new Date(row.invoice_date);
      if (invoiceDate >= monthStart && invoiceDate <= now) {
        gmvMtd += Number(row.total_amount ?? 0);
      }
      if (invoiceDate >= prevMonthStart && invoiceDate <= prevMonthComparisonEnd) {
        gmvPrevWindow += Number(row.total_amount ?? 0);
      }
    }

    const visibleCatalogs = catalogs;
    const catalogIds = visibleCatalogs.map((catalog) => catalog.id);
    let countByCatalog = new Map<string, number>();
    if (catalogIds.length > 0) {
      const itemsRes = await supabaseAdmin
        .schema('app')
        .from('published_catalog_items')
        .select('catalog_id')
        .in('catalog_id', catalogIds)
        .is('deleted_at', null);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      for (const row of (itemsRes.data ?? []) as Array<{ catalog_id: string }>) {
        countByCatalog.set(row.catalog_id, (countByCatalog.get(row.catalog_id) ?? 0) + 1);
      }
    }

    const promotionsPreview = visibleCatalogs
      .slice(0, 5)
      .map((catalog) => ({
        id: catalog.id,
        name: catalog.name,
        product_count: countByCatalog.get(catalog.id) ?? 0,
        share_token: catalog.share_token,
        valid_until: catalog.valid_to,
        hero_image_url: catalog.hero_image_url ?? null,
      }));

    const OPEN_STATUSES = new Set(['draft', 'received', 'confirmed', 'partially_dispatched', 'dispatched']);
    const recentOrders = (ordersRes.data ?? []) as Array<{ id: string; status: string; placed_at: string | null }>;
    const openOrdersCount = recentOrders.filter((o) => OPEN_STATUSES.has(o.status)).length;
    const orderIds = recentOrders.map((row) => row.id);
    const recentOrderItems = ((orderItemsRes.data ?? []) as Array<{ order_id: string; tenant_product_id: string }>)
      .filter((row) => orderIds.includes(row.order_id));
    const previewProductIds = Array.from(new Set(recentOrderItems.map((row) => row.tenant_product_id))).slice(0, 5);
    const reorderPreviewMap = await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
      buyerId,
      productIds: previewProductIds,
      catalogId: null,
      catalogName: null,
      catalogValidUntil: null,
      priceOverrides: new Map(),
    });

    const payload: BuyerHomeResponse = {
      greeting_name: profile.greeting_name ?? buyer.contact_name ?? buyer.business_name,
      open_orders_count: openOrdersCount,
      summary_card: {
        gmv_mtd: Number(gmvMtd.toFixed(2)),
        invoice_count_ytd: (ytdInvoicesRes.data ?? []).length,
        trend_vs_last_month_pct: growthPct(gmvMtd, gmvPrevWindow),
      },
      dues_card: {
        outstanding_dues: credit.outstanding_dues,
        open_invoice_count: credit.open_invoice_count,
        earliest_due_date: credit.earliest_due_date,
        days_until_earliest_due: credit.days_until_earliest_due,
      },
      credit_card: {
        credit_limit: credit.credit_limit,
        available_credit: credit.available_credit,
        credit_used: credit.credit_used,
      },
      order_again_preview: previewProductIds
        .map((id) => reorderPreviewMap.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      latest_promotions_preview: promotionsPreview,
      recent_activity: activity,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[GET /api/buyer/home]', error);
    return NextResponse.json({ error: 'Failed to load buyer home' }, { status: 500 });
  }
}
