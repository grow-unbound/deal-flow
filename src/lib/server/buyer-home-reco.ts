import type { BuyerHomeRecoResponse } from '@/lib/buyer-home-types';
import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import type { BuyerCatalogItem } from '@/types/buyer';
import type { SupabaseClient } from '@supabase/supabase-js';

const RECENT_ORDER_PREVIEW_LIMIT = 20;
const ORDER_AGAIN_PREVIEW_LIMIT = 5;

type EventSourceItem = { tenant_product_id: string; event_date: string; priority: number };

export async function loadBuyerHomeReco(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string,
): Promise<BuyerHomeRecoResponse> {
  const allowedTenantBrandIds = await resolveBuyerAllowedTenantBrandIds(db, tenantId, buyerId);

  const [ordersRes, invoicesRes, estimatesRes, recoRes] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('id, placed_at, status')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .limit(RECENT_ORDER_PREVIEW_LIMIT),
    db
      .schema('app')
      .from('invoices')
      .select('id, invoice_date')
      .eq('tenant_id', tenantId)
      .eq('buyer_id', buyerId)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(RECENT_ORDER_PREVIEW_LIMIT),
    db
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
    db
      .schema('app')
      .rpc('reco_get_home', { p_tenant_id: tenantId, p_buyer_id: buyerId })
      .then((res) => res, () => ({ data: null, error: new Error('reco_get_home failed') })),
  ]);

  const queryError = ordersRes.error ?? invoicesRes.error ?? estimatesRes.error;
  if (queryError) {
    throw new Error(queryError.message ?? 'Failed to load buyer home reco');
  }

  const recentOrders = (ordersRes.data ?? []) as Array<{ id: string; placed_at: string | null }>;
  const recentInvoices = (invoicesRes.data ?? []) as Array<{ id: string; invoice_date: string | null }>;
  const recentEstimates = (estimatesRes.data ?? []) as Array<{ id: string; created_at: string | null }>;

  const [orderItemsRes, invoiceItemsRes, estimateItemsRes] = await Promise.all([
    recentOrders.length > 0
      ? db
          .schema('app')
          .from('order_items')
          .select('order_id, tenant_product_id, orders!inner(tenant_id, buyer_id)')
          .eq('orders.tenant_id', tenantId)
          .eq('orders.buyer_id', buyerId)
          .in('order_id', recentOrders.map((r) => r.id))
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ order_id: string; tenant_product_id: string }>, error: null }),
    recentInvoices.length > 0
      ? db
          .schema('app')
          .from('invoice_items')
          .select('invoice_id, tenant_product_id, invoices!inner(tenant_id, buyer_id)')
          .eq('invoices.tenant_id', tenantId)
          .eq('invoices.buyer_id', buyerId)
          .in('invoice_id', recentInvoices.map((r) => r.id))
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ invoice_id: string; tenant_product_id: string }>, error: null }),
    recentEstimates.length > 0
      ? db
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

  const orderDateById = new Map(recentOrders.map((r) => [r.id, r.placed_at ?? '']));
  const invoiceDateById = new Map(recentInvoices.map((r) => [r.id, r.invoice_date ?? '']));
  const estimateDateById = new Map(recentEstimates.map((r) => [r.id, r.created_at ?? '']));

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

  const [reorderPreviewMap, bestsellers] = await Promise.all([
    assembleBuyerCatalogItemsForProductIds(db, {
      tenantId,
      buyerId,
      productIds: previewProductIds,
      allowedTenantBrandIds,
      campaignId: null,
      campaignName: null,
      campaignValidUntil: null,
      priceOverrides: new Map(),
    }),
    loadBestsellers(db, tenantId, buyerId, allowedTenantBrandIds, recoRes),
  ]);

  return {
    order_again_preview: previewProductIds
      .map((id) => reorderPreviewMap.get(id))
      .filter((item): item is BuyerCatalogItem => Boolean(item)),
    bestsellers,
  };
}

async function loadBestsellers(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string,
  allowedTenantBrandIds: string[] | null,
  recoRes: { data: unknown; error: Error | null },
): Promise<BuyerCatalogItem[]> {
  try {
    if (recoRes.error || !recoRes.data) return [];
    const recoData = recoRes.data as { bestsellers?: string[] };
    const bestsellerIds = (recoData.bestsellers ?? []).slice(0, 12);
    if (bestsellerIds.length === 0) return [];

    const bestsellerMap = await assembleBuyerCatalogItemsForProductIds(db, {
      tenantId,
      buyerId,
      productIds: bestsellerIds,
      allowedTenantBrandIds,
      campaignId: null,
      campaignName: null,
      campaignValidUntil: null,
      priceOverrides: new Map(),
    });

    return bestsellerIds
      .map((id) => bestsellerMap.get(id))
      .filter((item): item is BuyerCatalogItem => Boolean(item));
  } catch {
    return [];
  }
}
