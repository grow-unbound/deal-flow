import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
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
    return response;
  };

  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return timedJson({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
  if (!flagEnabled) return timedJson({ error: 'Feature not enabled' }, { status: 403 });

  const db = supabaseAdmin as any;

  // Cross-tenant guard
  const { data: location, error: locationError } = await db
    .schema('app')
    .from('locations')
    .select('id, tenant_id, name, type, address, deleted_at, created_at')
    .eq('id', id)
    .single();

  if (locationError || !location || location.tenant_id !== claims.tenant_id) {
    return timedJson({ error: 'Not found' }, { status: 404 });
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
    invoicesRes,
    activityRes,
  ] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, status, placed_at')
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
      .select('tenant_product_id, qty_available, reorder_point, updated_at, tenant_products(name, daily_sales_rate, deleted_at, tenant_brands(name))')
      .eq('location_id', id),

    db
      .schema('app')
      .from('invoices')
      .select('id, outstanding_balance, status, invoice_date')
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
  const currentOrders: Array<{ id: string; buyer_id: string; total_amount: number }> =
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

  // Orders tab — current period orders with buyer name
  const allOrdersFull = currentOrders as Array<{ id: string; buyer_id: string; total_amount: number }>;
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

  const orders: LocationDetailOrder[] = allOrdersFull.map((o) => {
    const detail = orderDetails.get(o.id);
    const buyerName = buyerMap.get(o.buyer_id)?.business_name ?? 'Unknown';
    return {
      order_id: o.id,
      order_number: detail?.order_number ?? o.id.slice(0, 8),
      placed_at: detail?.placed_at ?? new Date().toISOString(),
      buyer_name: buyerName,
      items_count: itemsCountByOrder.get(o.id) ?? 0,
      total_amount: Number(o.total_amount ?? 0),
      status: detail?.status ?? 'draft',
    };
  });

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

  const response: LocationDetailResponse = {
    id: location.id,
    name: location.name,
    type: location.type,
    city,
    initials,
    is_active: location.deleted_at === null,
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
    orders,
    inventory,
    activity,
    tab_badges: {
      customers: allBuyerIds.length,
      orders_mtd: currentOrders.length,
      low_stock_skus: low_stock_skus_count,
    },
  };

  return timedJson(response);
}
