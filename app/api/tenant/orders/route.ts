import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import {
  applySellerLocationScope,
  isSellerLocationSelectionAllowed,
  loadAccessibleSellerLocations,
  locationScopeCacheKey,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { loadTenantSalesOrderComposer } from '@/lib/sales-orders/load-tenant-sales-order-composer';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { FEATURE_FLAGS } from '@/constants';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';

const CreateSalesOrderDraftSchema = z.object({
  from_estimate_id: z.string().uuid().optional(),
});

type OrderStatus =
  | 'draft'
  | 'open'
  | 'received'
  | 'confirmed'
  | 'partially_dispatched'
  | 'dispatched'
  | 'delivered'
  | 'invoiced'
  | 'partially_invoiced'
  | 'overdue'
  | 'void'
  | 'cancelled';
type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';
type AvatarHue = 'teal' | 'ember' | 'cream';

type SalesOrderFilterChip = 'Received' | 'Confirmed' | 'In transit' | 'Invoiced' | 'Delivered' | 'Cancelled' | 'All';

interface BuyerRow {
  id: string;
  business_name: string;
  geography: Record<string, unknown> | null;
}

interface OrderRow {
  id: string;
  location_id: string | null;
  order_number: string;
  buyer_id: string;
  status: string;
  source: string | null;
  campaign_id: string | null;
  estimate_id: string | null;
  placed_by: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  placed_at: string;
  created_at: string;
}

interface OrderItemRow {
  order_id: string;
}

const ORDERS_LANDING_CACHE_TTL_MS = 20_000;
const ordersLandingCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getHue(index: number): AvatarHue {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function statusMeta(status: OrderStatus): { label: string; tone: StatusTone; filterChip: SalesOrderFilterChip } {
  if (status === 'received' || status === 'draft' || status === 'open') {
    return { label: 'Received', tone: 'neutral', filterChip: 'Received' };
  }
  if (status === 'confirmed') return { label: 'Confirmed', tone: 'warning', filterChip: 'Confirmed' };
  if (status === 'partially_dispatched') {
    return { label: 'Partly dispatched', tone: 'warning', filterChip: 'In transit' };
  }
  if (status === 'dispatched') {
    return { label: 'In transit', tone: 'neutral', filterChip: 'In transit' };
  }
  if (status === 'delivered') return { label: 'Delivered', tone: 'success', filterChip: 'Delivered' };
  if (status === 'invoiced' || status === 'partially_invoiced' || status === 'overdue') return { label: 'Invoiced', tone: 'success', filterChip: 'Invoiced' };
  if (status === 'void' || status === 'cancelled') return { label: 'Cancelled', tone: 'neutral', filterChip: 'Cancelled' };
  return { label: 'Received', tone: 'neutral', filterChip: 'Received' };
}

function getCity(geography: Record<string, unknown> | null): string {
  if (!geography) return 'Unknown city';
  const city = geography.city;
  if (typeof city === 'string' && city.trim().length > 0) return city;
  return 'Unknown city';
}

function getState(geography: Record<string, unknown> | null): string | null {
  if (!geography) return null;
  const state = geography.state;
  if (typeof state === 'string' && state.trim().length > 0) return state;
  return null;
}

function sourceLabel(source: string | null): string {
  if (source === 'cockpit_manual') return 'seller_app';
  if (source === 'buyer_app') return 'buyer_app';
  if (source === 'csv_import') return 'csv_import';
  return '—';
}

function orderSourceCategory(order: Pick<OrderRow, 'source' | 'estimate_id'>): string {
  if (order.estimate_id) return 'Converted Estimate';
  if (order.source === 'buyer_app') return 'Buyer App';
  return 'Direct';
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('orders_api'));
    return response;
  };
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const sourceParams = readArrayParam(req.nextUrl.searchParams, 'source');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const locationParams = readArrayParam(req.nextUrl.searchParams, 'location_id');

    const db = supabaseAdmin;

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '200'), 500);
    const cacheKey = [
      tenantId,
      claims.role ?? 'unknown',
      locationScopeCacheKey(claims),
      limit,
      search,
      sourceParams.join('|'),
      statusParams.join('|'),
      locationParams.join('|'),
      period.selected,
      period.current_start.slice(0, 10),
      period.current_end_exclusive.slice(0, 10),
      period.previous_start.slice(0, 10),
      period.previous_end_exclusive.slice(0, 10),
    ].join(':');

    const cached = ordersLandingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return timedJson(cached.payload);
    }

    const scopedCurrentOrdersQuery = applySellerLocationScope(
      db
        .schema('app')
        .from('orders')
        .select('id, order_number, buyer_id, location_id, status, source, campaign_id, estimate_id, placed_by, subtotal, tax_amount, total_amount, placed_at, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('placed_at', period.current_start)
        .lt('placed_at', period.current_end_exclusive)
        .order('placed_at', { ascending: false })
        .limit(limit),
      claims,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopedPreviousOrdersQuery = applySellerLocationScope(
      db
        .schema('app')
        .from('orders')
        .select('id, total_amount')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('placed_at', period.previous_start)
        .lt('placed_at', period.previous_end_exclusive) as any,
      claims,
    );

    const [buyersRes, mtdOrdersRes, prevOrdersRes, kpiCurrentRes, kpiPrevRes] = await Promise.all([
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      scopedCurrentOrdersQuery,
      scopedPreviousOrdersQuery,
      claims.role === 'seller_admin'
        ? db
            .schema('app')
            .from('kpi_tenant_daily')
            .select('orders_count, buyers_count, gmv')
            .eq('tenant_id', tenantId)
            .gte('day', period.current_start.slice(0, 10))
            .lt('day', period.current_end_exclusive.slice(0, 10))
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      claims.role === 'seller_admin'
        ? db
            .schema('app')
            .from('kpi_tenant_daily')
            .select('orders_count, gmv')
            .eq('tenant_id', tenantId)
            .gte('day', period.previous_start.slice(0, 10))
            .lt('day', period.previous_end_exclusive.slice(0, 10))
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (buyersRes.error || mtdOrdersRes.error || prevOrdersRes.error) {
      console.error('[GET /api/tenant/orders] query error:', buyersRes.error || mtdOrdersRes.error || prevOrdersRes.error);
      return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const buyers = (buyersRes.data ?? []) as BuyerRow[];
    const mtdOrders = (mtdOrdersRes.data ?? []) as OrderRow[];
    const prevOrders = (prevOrdersRes.data ?? []) as Array<{ id: string; total_amount: number }>;
    const catalogIds = Array.from(new Set(mtdOrders.map((order) => order.campaign_id).filter((value): value is string => Boolean(value))));
    const estimateIds = Array.from(new Set(mtdOrders.map((order) => order.estimate_id).filter((value): value is string => Boolean(value))));
    const placedByIds = Array.from(new Set(mtdOrders.map((order) => order.placed_by).filter((value): value is string => Boolean(value))));

    const [catalogsRes, estimatesRes, placedByMap] = await Promise.all([
      catalogIds.length > 0
        ? db.schema('app').from('campaigns').select('id, name').in('id', catalogIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      estimateIds.length > 0
        ? db.schema('app').from('estimates').select('id, estimate_number').in('id', estimateIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ id: string; estimate_number: string | null }>, error: null }),
      getAuthUserDisplayNameMap(placedByIds),
    ]);

    if (catalogsRes.error || estimatesRes.error) {
      console.error('[GET /api/tenant/orders] supporting query error:', catalogsRes.error || estimatesRes.error);
      return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const catalogById = new Map<string, string>(
      ((catalogsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
    );
    const estimateById = new Map<string, string | null>(
      ((estimatesRes.data ?? []) as Array<{ id: string; estimate_number: string | null }>).map((row) => [row.id, row.estimate_number]),
    );

    const orderIds = mtdOrders.map((order) => order.id);
    let orderItems: OrderItemRow[] = [];

    if (orderIds.length > 0) {
      const orderItemsRes = await db
        .schema('app')
        .from('order_items')
        .select('order_id')
        .in('order_id', orderIds)
        .is('deleted_at', null);

      if (orderItemsRes.error) {
        console.error('[GET /api/tenant/orders] order_items error:', orderItemsRes.error);
        return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
      }

      orderItems = (orderItemsRes.data ?? []) as OrderItemRow[];
    }

    const buyerById = new Map<string, BuyerRow>();
    for (const buyer of buyers) {
      buyerById.set(buyer.id, buyer);
    }

    const itemsCountByOrder = new Map<string, number>();
    for (const item of orderItems) {
      itemsCountByOrder.set(item.order_id, (itemsCountByOrder.get(item.order_id) ?? 0) + 1);
    }

    const availableLocations = await loadAccessibleSellerLocations(db as any, tenantId, claims);
    const locationNameById = new Map(availableLocations.map((location) => [location.id, location.name]));

    const buyersMtd = (kpiCurrentRes.data ?? []).reduce((sum, row) => sum + Number(row.buyers_count ?? 0), 0)
      || new Set(mtdOrders.map((order) => order.buyer_id)).size;
    const ordersMtd = (kpiCurrentRes.data ?? []).reduce((sum, row) => sum + Number(row.orders_count ?? 0), 0)
      || mtdOrders.length;
    const ordersPrevMtd = (kpiPrevRes.data ?? []).reduce((sum, row) => sum + Number(row.orders_count ?? 0), 0)
      || prevOrders.length;
    const gmvMtd = (kpiCurrentRes.data ?? []).reduce((sum, row) => sum + Number(row.gmv ?? 0), 0)
      || mtdOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    const gmvPrevMtd = (kpiPrevRes.data ?? []).reduce((sum, row) => sum + Number(row.gmv ?? 0), 0)
      || prevOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    const ordersGrowthPct = ordersPrevMtd > 0 ? Math.round(((ordersMtd - ordersPrevMtd) / ordersPrevMtd) * 100) : 0;
    const aov = gmvMtd / ordersMtd;

    const pendingDispatchCount = mtdOrders.filter((order) => order.status === 'confirmed').length;
    const receivedCount = mtdOrders.filter((order) => order.status === 'received').length;
    const deliveredCount = mtdOrders.filter((order) => order.status === 'delivered').length;

    const rows = mtdOrders.map((order, index) => {
      const buyer = buyerById.get(order.buyer_id);
      const buyerName = buyer?.business_name ?? 'Unknown buyer';
      const geography = (buyer?.geography ?? null) as Record<string, unknown> | null;
      const city = getCity(geography);
      const state = getState(geography);
      const status = order.status as OrderStatus;
      const meta = statusMeta(status);
      const estimateNumber = order.estimate_id ? estimateById.get(order.estimate_id) ?? null : null;
      const actorLabel = order.placed_by ? placedByMap.get(order.placed_by) ?? 'Team member' : 'Team member';
      const sourceLinePrimary = estimateNumber && estimateNumber.trim().length > 0 ? estimateNumber : sourceLabel(order.source);
      const sourceLineSecondary =
        estimateNumber && estimateNumber.trim().length > 0 ? `Converted by ${actorLabel}` : actorLabel;
      const sourceCategory = orderSourceCategory(order);

      return {
        id: order.id,
        location_id: order.location_id,
        location_name: order.location_id ? locationNameById.get(order.location_id) ?? null : null,
        order_id: order.order_number,
        buyer_id: order.buyer_id,
        buyer_name: buyerName,
        buyer_city: city === 'Unknown city' ? null : city,
        buyer_state: state,
        buyer_initials: getInitials(buyerName),
        buyer_hue: getHue(index),
        delivery_city: city,
        delivery_label: city,
        source: order.source,
        source_category: sourceCategory,
        source_label: sourceLinePrimary,
        source_detail: sourceLineSecondary,
        catalog_name: order.campaign_id ? catalogById.get(order.campaign_id) ?? null : null,
        items_count: itemsCountByOrder.get(order.id) ?? 0,
        gmv: Number(order.total_amount ?? 0),
        subtotal: Number(order.subtotal ?? 0),
        tax_amount: Number(order.tax_amount ?? 0),
        total_amount: Number(order.total_amount ?? 0),
        status: {
          value: status,
          label: meta.label,
          tone: meta.tone,
          filter_chip: meta.filterChip,
        },
        placed_at: order.placed_at,
      };
    });
    const filteredRows = rows.filter((row) => {
      const sourceMatch = sourceParams.length === 0 || sourceParams.includes((row as typeof row & { source_category: string }).source_category);
      const statusMatch = statusParams.length === 0 || statusParams.includes(row.status.label);
      const locationMatch = locationParams.length === 0 || (row.location_id ? locationParams.includes(row.location_id) : false);
      const searchMatch =
        search.length === 0 ||
        [row.order_id, row.buyer_name, row.delivery_city, row.catalog_name ?? '', row.source_label, row.source_detail, row.location_name ?? '']
          .some((value) => value.toLowerCase().includes(search));
      return sourceMatch && statusMatch && locationMatch && searchMatch;
    });

    const needsAttention = filteredRows.filter((row) => row.status.value === 'received').slice(0, 3);
    const biggestTickets = [...filteredRows].sort((a, b) => b.gmv - a.gmv).slice(0, 3);
    const inMotion = filteredRows
      .filter((row) => row.status.value === 'dispatched' || row.status.value === 'partially_dispatched')
      .slice(0, 3);
    const filteredGmv = filteredRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const filteredReceived = filteredRows.filter((row) => row.status.value === 'received').length;
    const filteredPendingDispatch = filteredRows.filter((row) => row.status.value === 'confirmed').length;
    const filteredDelivered = filteredRows.filter((row) => row.status.value === 'delivered').length;
    const filteredBuyers = new Set(filteredRows.map((row) => row.buyer_id)).size;
    const filters: LandingFilterMeta = {
      groups: [
        {
          key: 'source',
          label: 'Source',
          options: ['Buyer App', 'Direct', 'Converted Estimate'].map((value) => ({ value, label: value })),
        },
        {
          key: 'status',
          label: 'Status',
          options: ['Received', 'Confirmed', 'In transit', 'Invoiced', 'Delivered', 'Cancelled'].map((value) => ({ value, label: value })),
        },
        {
          key: 'location_id',
          label: 'Location',
          options: availableLocations.map((location) => ({ value: location.id, label: location.name })),
        },
      ],
    };

    const payload = {
      period,
      kpis: {
        orders_mtd: filteredRows.length,
        orders_prev_mtd: ordersPrevMtd,
        orders_growth_pct: ordersGrowthPct,
        gmv_mtd: filteredGmv,
        gmv_prev_mtd: gmvPrevMtd,
        aov: filteredRows.length > 0 ? filteredGmv / filteredRows.length : 0,
        pending_dispatch_count: filteredPendingDispatch,
        received_count: filteredReceived,
        delivered_count: filteredDelivered,
        buyers_mtd: filteredBuyers,
      },
      todays_read: {
        needs_attention: needsAttention,
        biggest_tickets: biggestTickets,
        in_motion: inMotion,
      },
      orders: filteredRows,
      filters,
      total: filteredRows.length,
    };

    ordersLandingCache.set(cacheKey, {
      expiresAt: Date.now() + ORDERS_LANDING_CACHE_TTL_MS,
      payload,
    });

    return timedJson(payload);
  } catch (error) {
    console.error('[GET /api/tenant/orders] unexpected error:', error);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }
}

function plusDays(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, salesOrders, createFlags] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
      getInAppCreateFlags(claims.tenant_id),
    ]);

    if (!orderMgmt || !salesOrders) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }
    if (!createFlags.create_sales_orders) {
      return NextResponse.json({ error: 'Sales order creation is disabled for this tenant' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = CreateSalesOrderDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;
    const fromEstimateId = parsed.data.from_estimate_id ?? null;

    const { data: existingOrders, error: countError } = await db
      .schema('app')
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (countError) {
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
    }

    const orderNumber = `SO-${new Date().getFullYear()}-${String((existingOrders ?? []).length + 1).padStart(5, '0')}`;
    const draftDate = new Date().toISOString();
    const expectedDelivery = plusDays(7);

    let buyerId: string | null = null;
    let locationId: string | null = null;
    let notes = '';
    let buyerPoRef = '';
    let discountFlat = 0;
    let freight = 0;
    let roundOff = 0;
    let estimateRows: Array<Record<string, unknown>> = [];

    if (fromEstimateId) {
      const { data: estimate, error: estimateError } = await db
        .schema('app')
        .from('estimates')
        .select('id, tenant_id, buyer_id, location_id, estimate_number, notes, buyer_po_ref, discount_flat, freight, round_off')
        .eq('id', fromEstimateId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (estimateError || !estimate) {
        return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
      }

      const itemsRes = await db
        .schema('app')
        .from('estimate_items')
        .select('tenant_product_id, qty, unit_price, tax_rate, tax_pct, disc_pct, discount_pct, scheme_tag, line_total')
        .eq('estimate_id', fromEstimateId)
        .is('deleted_at', null);

      if (itemsRes.error) {
        return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
      }

      buyerId = estimate.buyer_id;
      locationId = (estimate.location_id as string | null | undefined) ?? null;
      notes = estimate.notes ?? '';
      buyerPoRef = estimate.buyer_po_ref ?? '';
      discountFlat = Number(estimate.discount_flat ?? 0);
      freight = Number(estimate.freight ?? 0);
      roundOff = Number(estimate.round_off ?? 0);
      estimateRows = (itemsRes.data ?? []) as Array<Record<string, unknown>>;
    }

    const subtotal = estimateRows.reduce((sum, row) => {
      const qty = Number(row.qty ?? 0);
      const unitPrice = Number(row.unit_price ?? 0);
      const discPct = Number(row.disc_pct ?? row.discount_pct ?? 0);
      return sum + qty * unitPrice * (1 - discPct / 100);
    }, 0);
    const taxAmount = estimateRows.reduce((sum, row) => {
      const qty = Number(row.qty ?? 0);
      const unitPrice = Number(row.unit_price ?? 0);
      const discPct = Number(row.disc_pct ?? row.discount_pct ?? 0);
      const taxable = qty * unitPrice * (1 - discPct / 100);
      return sum + taxable * (Number(row.tax_pct ?? row.tax_rate ?? 0) / 100);
    }, 0);
    const totalAmount = Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff;
    const availableLocations = await loadAccessibleSellerLocations(db as any, tenantId, claims);
    const resolvedLocationId = locationId ?? resolveDefaultSellerLocationId(claims, availableLocations);
    if (!resolvedLocationId || !isSellerLocationSelectionAllowed(claims, resolvedLocationId)) {
      return NextResponse.json({ error: 'No accessible location available for this user' }, { status: 400 });
    }

    const { data: order, error: orderError } = await db
      .schema('app')
      .from('orders')
      .insert({
        tenant_id: tenantId,
        location_id: resolvedLocationId,
        buyer_id: buyerId,
        placed_by: claims.sub,
        order_number: orderNumber,
        status: 'draft',
        source: 'cockpit_manual',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: 'INR',
        notes,
        placed_at: draftDate,
        buyer_po_ref: buyerPoRef,
        discount_flat: discountFlat,
        freight,
        round_off: roundOff,
        has_backorder: false,
        estimate_id: fromEstimateId,
        expected_delivery: expectedDelivery,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id')
      .single();

    if (orderError || !order) {
      console.error('[POST /api/tenant/orders]', orderError);
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
    }

    if (estimateRows.length > 0) {
      const inventoryRes = await db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available')
        .in('tenant_product_id', estimateRows.map((row) => row.tenant_product_id));

      const onHandByProduct = new Map<string, number>();
      for (const inventoryRow of (inventoryRes.data ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>) {
        onHandByProduct.set(
          inventoryRow.tenant_product_id,
          (onHandByProduct.get(inventoryRow.tenant_product_id) ?? 0) + Number(inventoryRow.qty_available ?? 0),
        );
      }

      const { error: itemsInsertError } = await db
        .schema('app')
        .from('order_items')
        .insert(
          estimateRows.map((row) => ({
            order_id: order.id,
            tenant_product_id: row.tenant_product_id,
            qty: Number(row.qty ?? 0),
            unit_price: Number(row.unit_price ?? 0),
            tax_rate: Number(row.tax_rate ?? row.tax_pct ?? 0),
            tax_pct: Number(row.tax_pct ?? row.tax_rate ?? 0),
            disc_pct: Number(row.disc_pct ?? row.discount_pct ?? 0),
            scheme_tag: row.scheme_tag ?? null,
            line_total: Number(row.line_total ?? 0),
            on_hand_at_confirm: onHandByProduct.get(String(row.tenant_product_id)) ?? 0,
            created_by: claims.sub,
            updated_by: claims.sub,
          })),
        );

      if (itemsInsertError) {
        console.error('[POST /api/tenant/orders] order_items', itemsInsertError);
        return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
      }
    }

    const composer = await loadTenantSalesOrderComposer(db, tenantId, order.id as string, claims);
    if (composer === 'notfound' || composer === 'forbidden') {
      return NextResponse.json({ error: 'Failed to load draft' }, { status: 500 });
    }

    return NextResponse.json({
      data: composer,
    });
  } catch (error) {
    console.error('[POST /api/tenant/orders]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
