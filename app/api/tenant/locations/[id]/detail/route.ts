import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { normalizeLocationAssociatedUsers } from '@/lib/location-assignees';
import { createTimer } from '@/lib/server-timing';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import type {
  LocationDetailResponse,
  LocationDetailGmvWeek,
  LocationDetailInventoryHealth,
  LocationDetailTopBuyer,
  LocationDetailCustomer,
  LocationDetailOrder,
  LocationDetailInventoryItem,
  LocationDetailActivityItem,
  LocationStockStatus,
} from '@/hooks/useLocations';

export const dynamic = 'force-dynamic';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getCity(address: unknown): string {
  if (address && typeof address === 'object') {
    const a = address as Record<string, unknown>;
    if (typeof a.city === 'string' && a.city.trim()) return a.city.trim();
  }
  return '';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('location_detail'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return timedJson({ error: 'Forbidden' }, { status: 403 });

  const db = supabaseAdmin as any;

  // Cross-tenant guard
  const { data: baseLocation, error: locationError } = await db
    .schema('app')
    .from('locations')
    .select('id, tenant_id, name, address, deleted_at, created_at')
    .eq('id', id)
    .single();

  if (locationError || !baseLocation || baseLocation.tenant_id !== claims.tenant_id) {
    return timedJson({ error: 'Not found' }, { status: 404 });
  }

  let location: typeof baseLocation & {
    phone_number: string | null;
    status: 'active' | 'inactive';
    associated_users: unknown;
  } = {
    ...baseLocation,
    phone_number: null,
    status: 'active',
    associated_users: [],
  };

  try {
    const { data: extraLocation } = await db
      .schema('app')
      .from('locations')
      .select('id, phone_number, status, associated_users')
      .eq('id', id)
      .single();
    if (extraLocation) {
      location = {
        ...location,
        phone_number: typeof extraLocation.phone_number === 'string' ? extraLocation.phone_number : null,
        status:
          extraLocation.status === 'inactive' ? 'inactive' : 'active',
        associated_users: extraLocation.associated_users,
      };
    }
  } catch {
    // Compatibility with older deployments where the new columns do not exist yet.
  }

  const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));

  // 6 weeks back for trend chart
  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const sixWeeksIso = sixWeeksAgo.toISOString();

  const [
    currentOrdersRes,
    prevOrdersRes,
    trendRes,
    inventoryRes,
    estimatesRes,
    invoicesRes,
    activityRes,
  ] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, buyer_id, location_id, total_amount, status, source, is_buyer_app_order, campaign_id, estimate_id, place_of_supply, placed_at, created_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('location_id', id)
      .not('status', 'in', '("cancelled","draft")')
      .is('deleted_at', null)
      .gte('placed_at', period.current_start)
      .lt('placed_at', period.current_end_exclusive),

    db
      .schema('app')
      .from('orders')
      .select('id, total_amount')
      .eq('tenant_id', claims.tenant_id)
      .eq('location_id', id)
      .not('status', 'in', '("cancelled","draft")')
      .is('deleted_at', null)
      .gte('placed_at', period.previous_start)
      .lt('placed_at', period.previous_end_exclusive),

    // GMV trend: use kpi_location_daily for weekly buckets
    db
      .schema('app')
      .from('kpi_location_daily')
      .select('day, gmv, orders_count')
      .eq('tenant_id', claims.tenant_id)
      .eq('location_id', id)
      .gte('day', sixWeeksIso.split('T')[0])
      .order('day', { ascending: true }),

    db
      .schema('app')
      .from('tenant_inventory')
      .select('tenant_product_id, qty_available, reorder_point, updated_at, warehouses!inner(location_id), tenant_products(name, daily_sales_rate, deleted_at, tenant_brands(name))')
      .eq('warehouses.location_id', id)
      .is('deleted_at', null),

    db
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, buyer_id, location_id, status, source, is_buyer_app_estimate, campaign_id, place_of_supply, total_amount, estimate_date, created_at, expires_at')
      .eq('tenant_id', claims.tenant_id)
      .eq('location_id', id)
      .is('deleted_at', null)
      .gte('estimate_date', period.current_start)
      .lt('estimate_date', period.current_end_exclusive)
      .order('estimate_date', { ascending: false }),

    db
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, buyer_id, location_id, order_id, estimate_id, is_buyer_app_invoice, outstanding_balance, status, invoice_date, due_date, created_at, created_by, place_of_supply, total_amount')
      .eq('tenant_id', claims.tenant_id)
      .eq('location_id', id)
      .in('status', ['issued', 'partially_paid'])
      .is('deleted_at', null),

    db
      .schema('app')
      .from('audit_log')
      .select('id, action, entity_type, diff, ts, actor_user_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('entity_type', 'location')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(50),
  ]);

  // Period GMV
  const currentOrders: Array<{
    id: string;
    order_number: string;
    buyer_id: string;
    location_id: string | null;
    total_amount: number;
    status: string;
    source: string | null;
    is_buyer_app_order: boolean;
    campaign_id: string | null;
    estimate_id: string | null;
    place_of_supply: string | null;
    placed_at: string;
    created_at: string;
  }> =
    currentOrdersRes.data ?? [];
  const prevOrders: Array<{ id: string; total_amount: number }> =
    prevOrdersRes.data ?? [];

  const gmv_mtd = currentOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const gmv_prev = prevOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const growth_pct = gmv_prev > 0 ? Math.round(((gmv_mtd - gmv_prev) / gmv_prev) * 100) : 0;

  const activeBuyerSet = new Set(currentOrders.map((o) => o.buyer_id));
  const active_buyers = activeBuyerSet.size;

  // Outstanding dues
  const invoices: Array<{ id: string; outstanding_balance: number; invoice_date: string }> =
    invoicesRes.data ?? [];
  const outstanding_dues = invoices.reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0);
  const invoice_count = invoices.length;

  // GMV trend — bucket daily rows into ISO weeks
  const dailyRows: Array<{ day: string; gmv: number; orders_count: number }> =
    trendRes.data ?? [];
  const weekBuckets = new Map<string, { gmv: number; orders: number; start: string }>();
  for (const row of dailyRows) {
    const d = new Date(row.day);
    // ISO week: get Monday
    const dow = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dow + 6) % 7));
    const key = monday.toISOString().split('T')[0]!;
    const existing = weekBuckets.get(key) ?? { gmv: 0, orders: 0, start: key };
    existing.gmv += Number(row.gmv ?? 0);
    existing.orders += Number(row.orders_count ?? 0);
    weekBuckets.set(key, existing);
  }

  const gmv_trend: LocationDetailGmvWeek[] = [...weekBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, val]) => {
      const d = new Date(key);
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      return {
        week_label: label,
        week_start: key,
        gmv: val.gmv,
        orders_count: val.orders,
      };
    });

  // Inventory
  const invRows: Array<Record<string, any>> = inventoryRes.data ?? [];
  const low_stock_skus_count = invRows.filter((r) => {
    const qty = Number(r.qty_available ?? 0);
    const rp = r.reorder_point != null ? Number(r.reorder_point) : null;
    return qty > 0 && rp !== null && qty <= rp;
  }).length;
  const oos_skus_count = invRows.filter((r) => Number(r.qty_available ?? 0) <= 0).length;
  const active_skus = invRows.filter((r) => r.tenant_products?.deleted_at == null).length;

  const avgCovers = invRows
    .map((r) => {
      const qty = Number(r.qty_available ?? 0);
      const rate = Number(r.tenant_products?.daily_sales_rate ?? 0);
      return rate > 0 ? qty / rate : null;
    })
    .filter((v): v is number => v !== null);
  const avg_days_cover =
    avgCovers.length > 0
      ? Math.round(avgCovers.reduce((s, v) => s + v, 0) / avgCovers.length)
      : null;

  const inventory_health: LocationDetailInventoryHealth = {
    active_skus,
    oos_skus: oos_skus_count,
    low_stock_skus: low_stock_skus_count,
    avg_days_cover,
  };

  // Buyer spend aggregation for top buyers and customers tab
  const spendByBuyer = new Map<string, number>();
  const orderCountByBuyer = new Map<string, number>();
  for (const o of currentOrders) {
    spendByBuyer.set(o.buyer_id, (spendByBuyer.get(o.buyer_id) ?? 0) + Number(o.total_amount ?? 0));
    orderCountByBuyer.set(o.buyer_id, (orderCountByBuyer.get(o.buyer_id) ?? 0) + 1);
  }

  // Fetch buyer names for top 5 by spend
  const sortedBuyerIds = [...spendByBuyer.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);

  const top5Ids = sortedBuyerIds.slice(0, 5);
  const allBuyerIds = sortedBuyerIds;

  const buyerDuesMap = new Map<string, number>();
  const [buyerNamesRes, buyerDuesRes] = await Promise.all([
    allBuyerIds.length
      ? db
          .schema('app')
          .from('buyers')
          .select('id, business_name, address')
          .in('id', allBuyerIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    allBuyerIds.length
      ? db
          .schema('app')
          .from('invoices')
          .select('buyer_id, outstanding_balance')
          .eq('tenant_id', claims.tenant_id)
          .in('buyer_id', allBuyerIds)
          .in('status', ['issued', 'partially_paid'])
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const buyerMap = new Map<string, { business_name: string; address: unknown }>();
  for (const b of buyerNamesRes.data ?? []) {
    buyerMap.set(b.id, b);
  }
  for (const i of buyerDuesRes.data ?? []) {
    buyerDuesMap.set(
      i.buyer_id,
      (buyerDuesMap.get(i.buyer_id) ?? 0) + Number(i.outstanding_balance ?? 0),
    );
  }

  const top_buyers: LocationDetailTopBuyer[] = top5Ids.map((buyerId) => {
    const b = buyerMap.get(buyerId);
    const name = b?.business_name ?? 'Unknown';
    return {
      buyer_id: buyerId,
      business_name: name,
      city: getCity(b?.address),
      initials: getInitials(name),
      spend_mtd: spendByBuyer.get(buyerId) ?? 0,
      outstanding_dues: buyerDuesMap.get(buyerId) ?? 0,
    };
  });

  // Customers tab — all buyers with orders at this location
  const customers: LocationDetailCustomer[] = allBuyerIds.map((buyerId) => {
    const b = buyerMap.get(buyerId);
    const name = b?.business_name ?? 'Unknown';
    return {
      buyer_id: buyerId,
      business_name: name,
      city: getCity(b?.address),
      initials: getInitials(name),
      spend_mtd: spendByBuyer.get(buyerId) ?? 0,
      orders_mtd: orderCountByBuyer.get(buyerId) ?? 0,
      outstanding_dues: buyerDuesMap.get(buyerId) ?? 0,
      last_order_at: null, // populated below
    };
  });

  const campaignIds = Array.from(
    new Set([
      ...(currentOrders as Array<{ campaign_id?: string | null }>).map((row) => row.campaign_id).filter((value: string | null | undefined): value is string => Boolean(value)),
      ...(estimatesRes.data ?? []).map((row: { campaign_id?: string | null }) => row.campaign_id).filter((value: string | null | undefined): value is string => Boolean(value)),
      ...(invoicesRes.data ?? []).map((row: { order_id?: string | null; estimate_id?: string | null }) => {
        const order = (currentOrders as Array<{ id: string; campaign_id?: string | null }>).find((o) => o.id === row.order_id);
        if (order?.campaign_id) return order.campaign_id;
        return null;
      }).filter((value: string | null): value is string => Boolean(value)),
    ]),
  );
  const campaignsRes = campaignIds.length > 0
    ? await db.schema('app').from('campaigns').select('id, name').in('id', campaignIds).is('deleted_at', null)
    : { data: [] as Array<{ id: string; name: string }>, error: null };
  if (campaignsRes.error) {
    return timedJson({ error: 'Failed to fetch location detail data' }, { status: 500 });
  }
  const campaignById = new Map(((campaignsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));

  // Orders tab — current period orders with buyer name
  const allOrdersFull = currentOrders as Array<{
    id: string;
    buyer_id: string;
    total_amount: number;
    source: string | null;
    is_buyer_app_order: boolean;
    campaign_id: string | null;
    estimate_id: string | null;
    place_of_supply: string | null;
    location_id: string | null;
  }>;
  // Fetch order items count + order number in one query
  const orderIds = allOrdersFull.map((o) => o.id);
  const [orderDetailRes, orderItemCountRes] = await Promise.all([
    orderIds.length
      ? db
          .schema('app')
          .from('orders')
          .select('id, order_number, placed_at, status')
          .in('id', orderIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    orderIds.length
      ? db
          .schema('app')
          .from('order_items')
          .select('order_id, qty')
          .in('order_id', orderIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const orderDetails = new Map<
    string,
    { order_number: string; placed_at: string; status: string }
  >();
  for (const o of orderDetailRes.data ?? []) {
    orderDetails.set(o.id, o);
  }
  const itemsCountByOrder = new Map<string, number>();
  for (const item of orderItemCountRes.data ?? []) {
    itemsCountByOrder.set(
      item.order_id,
      (itemsCountByOrder.get(item.order_id) ?? 0) + Number(item.qty ?? 1),
    );
  }

  const estimateNumberByIdForOrders = new Map<string, string | null>(
    (estimatesRes.data ?? []).map((row: { id: string; estimate_number: string | null }) => [row.id, row.estimate_number]),
  );

  const orders: LocationDetailOrder[] = allOrdersFull.map((o) => {
    const detail = orderDetails.get(o.id);
    const buyerName = buyerMap.get(o.buyer_id)?.business_name ?? 'Unknown';
    return {
      order_id: o.id,
      order_number: detail?.order_number ?? o.id.slice(0, 8),
      placed_at: detail?.placed_at ?? new Date().toISOString(),
      buyer_name: buyerName,
      place_of_supply: o.place_of_supply?.trim() || null,
      location_name: location.name,
      source_kind: o.estimate_id ? 'converted' : o.is_buyer_app_order ? 'buyer_app' : 'direct',
      source_label: o.estimate_id ? estimateNumberByIdForOrders.get(o.estimate_id) ?? null : o.is_buyer_app_order ? 'Buyer App' : null,
      campaign_name: o.campaign_id ? campaignById.get(o.campaign_id) ?? null : null,
      items_count: itemsCountByOrder.get(o.id) ?? 0,
      total_amount: Number(o.total_amount ?? 0),
      status: detail?.status ?? 'draft',
    };
  });

  const locationEstimates = (estimatesRes.data ?? []) as Array<{
    id: string;
    estimate_number: string;
    buyer_id: string;
    location_id: string | null;
    status: string;
    source: string | null;
    is_buyer_app_estimate: boolean;
    campaign_id: string | null;
    place_of_supply: string | null;
    total_amount: number;
    estimate_date: string;
    created_at: string;
    expires_at: string | null;
  }>;
  const locationInvoices = (invoicesRes.data ?? []) as Array<{
    id: string;
    invoice_number: string;
    buyer_id: string;
    location_id: string | null;
    order_id: string | null;
    estimate_id: string | null;
    is_buyer_app_invoice: boolean;
    outstanding_balance: number | null;
    status: string;
    invoice_date: string;
    due_date: string | null;
    created_at: string;
    created_by: string | null;
    place_of_supply: string | null;
    total_amount: number;
  }>;

  const [estimateItemCountRes, invoiceItemCountRes] = await Promise.all([
    locationEstimates.length
      ? db
          .schema('app')
          .from('estimate_items')
          .select('estimate_id')
          .in('estimate_id', locationEstimates.map((row) => row.id))
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ estimate_id: string }>, error: null }),
    locationInvoices.length
      ? db
          .schema('app')
          .from('invoice_items')
          .select('invoice_id')
          .in('invoice_id', locationInvoices.map((row) => row.id))
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ invoice_id: string }>, error: null }),
  ]);

  if (estimateItemCountRes.error || invoiceItemCountRes.error) {
    return timedJson({ error: 'Failed to fetch location detail data' }, { status: 500 });
  }

  const estimateItemsCountById = new Map<string, number>();
  for (const row of estimateItemCountRes.data ?? []) {
    estimateItemsCountById.set(row.estimate_id, (estimateItemsCountById.get(row.estimate_id) ?? 0) + 1);
  }
  const invoiceItemsCountById = new Map<string, number>();
  for (const row of invoiceItemCountRes.data ?? []) {
    invoiceItemsCountById.set(row.invoice_id, (invoiceItemsCountById.get(row.invoice_id) ?? 0) + 1);
  }
  const estimateNumberById = new Map(locationEstimates.map((row) => [row.id, row.estimate_number]));
  const estimateCampaignById = new Map(locationEstimates.map((row) => [row.id, row.campaign_id]));
  const invoiceById = new Map(locationInvoices.map((row) => [row.id, row]));

  // Inventory tab rows
  const inventory: LocationDetailInventoryItem[] = invRows
    .filter((r) => r.tenant_products?.deleted_at == null)
    .map((r) => {
      const qty = Number(r.qty_available ?? 0);
      const rate = Number(r.tenant_products?.daily_sales_rate ?? 0);
      const days_cover = rate > 0 ? Math.round(qty / rate) : null;
      const stock_status: LocationStockStatus =
        qty <= 0
          ? 'out_of_stock'
          : r.reorder_point != null && qty <= Number(r.reorder_point)
          ? 'low_stock'
          : 'clear';
      return {
        tenant_product_id: r.tenant_product_id,
        product_name: r.tenant_products?.name ?? 'Unknown',
        brand_name: r.tenant_products?.tenant_brands?.name ?? '—',
        qty_available: qty,
        days_cover,
        last_updated: r.updated_at ?? new Date().toISOString(),
        stock_status,
      };
    })
    .sort((a, b) => {
      // Out-of-stock first, then by days_cover asc
      if (a.stock_status === 'out_of_stock' && b.stock_status !== 'out_of_stock') return -1;
      if (b.stock_status === 'out_of_stock' && a.stock_status !== 'out_of_stock') return 1;
      const da = a.days_cover ?? 9999;
      const db2 = b.days_cover ?? 9999;
      return da - db2;
    });

  // Activity
  const activity: LocationDetailActivityItem[] = (activityRes.data ?? []).map(
    (a: Record<string, unknown>) => ({
      id: String(a.id),
      action: String(a.action ?? ''),
      entity_type: String(a.entity_type ?? ''),
      diff: (a.diff as Record<string, unknown>) ?? null,
      ts: String(a.ts ?? ''),
      actor_name: null,
    }),
  );

  const city = getCity(location.address);
  const initials = getInitials(location.name);
  const associatedUsers = normalizeLocationAssociatedUsers(location.associated_users);

  const response: LocationDetailResponse = {
    id: location.id,
    name: location.name,
    city,
    phone_number: location.phone_number ?? null,
    status: location.status ?? 'active',
    initials,
    is_active: location.deleted_at === null,
    associated_users: associatedUsers,
    meta_strip: {
      gmv_mtd,
      growth_pct,
      active_buyers,
      total_buyers: allBuyerIds.length,
      outstanding_dues,
      invoice_count,
      low_stock_skus: low_stock_skus_count,
    },
    overview: {
      gmv_trend,
      inventory_health,
      top_buyers,
    },
    customers,
    orders: currentOrders.map((order) => ({
      order_id: order.id,
      order_number: order.order_number,
      placed_at: order.placed_at,
      buyer_name: buyerMap.get(order.buyer_id)?.business_name ?? 'Unknown',
      place_of_supply: order.place_of_supply?.trim() || null,
      location_name: location.name,
      source_kind: order.estimate_id ? 'converted' : order.is_buyer_app_order ? 'buyer_app' : 'direct',
      source_label: order.estimate_id ? estimateNumberById.get(order.estimate_id) ?? null : order.is_buyer_app_order ? 'Buyer App' : null,
      campaign_name: order.campaign_id ? campaignById.get(order.campaign_id) ?? null : null,
      items_count: itemsCountByOrder.get(order.id) ?? 0,
      total_amount: Number(order.total_amount ?? 0),
      status: order.status,
    })),
    estimates: locationEstimates.map((estimate) => ({
      estimate_id: estimate.id,
      estimate_number: estimate.estimate_number,
      issued_at: estimate.estimate_date ?? estimate.created_at,
      buyer_name: buyerMap.get(estimate.buyer_id)?.business_name ?? 'Unknown',
      place_of_supply: estimate.place_of_supply?.trim() || null,
      location_name: location.name,
      source_kind: estimate.is_buyer_app_estimate ? 'buyer_app' : 'seller',
      source_label: estimate.is_buyer_app_estimate ? 'Buyer App' : null,
      campaign_name: estimate.campaign_id ? campaignById.get(estimate.campaign_id) ?? null : null,
      items_count: estimateItemsCountById.get(estimate.id) ?? 0,
      total_amount: Number(estimate.total_amount ?? 0),
      expires_at: estimate.expires_at ?? null,
      status: estimate.status,
    })),
    invoices: locationInvoices.map((invoice) => {
      const linkedOrder = invoice.order_id ? currentOrders.find((order) => order.id === invoice.order_id) ?? null : null;
      const linkedEstimate = invoice.estimate_id ? locationEstimates.find((estimate) => estimate.id === invoice.estimate_id) ?? null : null;
      const sourceKind = invoice.is_buyer_app_invoice
        ? 'buyer_app'
        : linkedOrder || linkedEstimate
          ? 'converted'
          : 'direct';
      const sourceLabel = sourceKind === 'buyer_app'
        ? 'Buyer App'
        : linkedEstimate?.estimate_number ?? linkedOrder?.order_number ?? null;
      const campaignId = linkedOrder?.campaign_id ?? linkedEstimate?.campaign_id ?? null;
      return {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        issued_at: invoice.invoice_date ?? invoice.created_at,
        buyer_name: buyerMap.get(invoice.buyer_id)?.business_name ?? 'Unknown',
        place_of_supply: invoice.place_of_supply?.trim() || null,
        location_name: location.name,
        source_kind: sourceKind,
        source_label: sourceLabel,
        campaign_name: campaignId ? campaignById.get(campaignId) ?? null : null,
        items_count: invoiceItemsCountById.get(invoice.id) ?? 0,
        total_amount: Number(invoice.total_amount ?? 0),
        outstanding_amount: Number(invoice.outstanding_balance ?? 0),
        due_date: invoice.due_date ?? null,
        status: invoice.status,
      };
    }),
    inventory,
    activity,
    tab_badges: {
      customers: allBuyerIds.length,
      orders_mtd: currentOrders.length,
      estimates_mtd: locationEstimates.length,
      invoices_mtd: locationInvoices.length,
      low_stock_skus: low_stock_skus_count,
    },
  };

  return timedJson(response);
}
