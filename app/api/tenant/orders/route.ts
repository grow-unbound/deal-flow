import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedClaims } from '@/lib/auth';
import { isoDateInTimeZone, offsetIsoDateInTimeZone } from '@/lib/date-utils';
import { getFlag } from '@/lib/flags';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import {
  applySellerLocationScope,
  getSellerLocationScope,
  isSellerLocationSelectionAllowed,
  loadAccessibleSellerLocations,
  resolveDefaultSellerLocationId,
} from '@/lib/server/seller-location-access';
import { loadInventoryAvailabilityMap } from '@/lib/server/warehouse-inventory';
import { loadTenantSalesOrderComposer } from '@/lib/sales-orders/load-tenant-sales-order-composer';
import { getAuthUserDisplayNameMap } from '@/lib/server/auth-user-directory';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { PAGE_SIZE, decodeCursor, encodeCursor } from '@/lib/pagination';
import { FEATURE_FLAGS } from '@/constants';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { applyTransactionTableSearch, loadTransactionSearchScopeIds, loadTransactionNumberMatchIds } from '@/lib/server/document-table-search';
import { getPostHogClient } from '@/lib/posthog-server';
import { withTenantSellerIds } from '@/lib/analytics-identity-server';

const CreateSalesOrderDraftSchema = z.object({
  from_estimate_id: z.string().uuid().optional(),
});

const SEE_ALL_LIMIT = PAGE_SIZE.MAX;
const STOCK_SHORTAGE_CANDIDATE_POOL = 100;

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
  is_buyer_app_order: boolean;
  campaign_id: string | null;
  estimate_id: string | null;
  place_of_supply: string | null;
  placed_by: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  order_date: string | null;
  placed_at: string;
  created_at: string;
  confirmed_at: string | null;
  dispatched_at: string | null;
}

interface OrderItemRow {
  order_id: string;
}

interface OrderShortageItemRow {
  order_id: string;
  tenant_product_id: string;
  qty: number;
}

const ORDER_COLUMNS =
  'id, order_number, buyer_id, location_id, status, source, is_buyer_app_order, campaign_id, estimate_id, place_of_supply, placed_by, subtotal, tax_amount, total_amount, order_date, placed_at, created_at, confirmed_at, dispatched_at';

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

function orderSourceCategory(order: Pick<OrderRow, 'is_buyer_app_order' | 'estimate_id'>): string {
  if (order.estimate_id) return 'Converted Estimate';
  if (order.is_buyer_app_order) return 'Buyer App';
  return 'Direct';
}

function sumMetric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

function getOrderDocumentTimestamp(order: Pick<OrderRow, 'order_date' | 'created_at'>): string {
  return order.order_date ?? order.created_at;
}

function applyOrderDocumentPeriod<T extends { or: (filter: string) => T }>(query: T, start: string, endExclusive: string): T {
  return query.or(
    `and(order_date.gte.${start},order_date.lt.${endExclusive}),and(order_date.is.null,created_at.gte.${start},created_at.lt.${endExclusive})`,
  );
}

function applyOrderCursor<T extends { or: (filter: string) => T }>(query: T, cursor: string): T {
  const { created_at, id } = decodeCursor(cursor);
  return query.or(
    `and(order_date.lt.${created_at}),and(order_date.eq.${created_at},id.lt.${id}),and(order_date.is.null,created_at.lt.${created_at}),and(order_date.is.null,created_at.eq.${created_at},id.lt.${id})`,
  );
}

function applyOrderStatusFilters<T extends { in: (column: string, values: string[]) => T }>(query: T, statusParams: string[]): T {
  const statuses = new Set<string>();
  statusParams.forEach((value) => {
    if (value === 'Received') {
      statuses.add('draft');
      statuses.add('open');
      statuses.add('received');
    }
    if (value === 'Confirmed') statuses.add('confirmed');
    if (value === 'In transit') {
      statuses.add('partially_dispatched');
      statuses.add('dispatched');
    }
    if (value === 'Invoiced') {
      statuses.add('invoiced');
      statuses.add('partially_invoiced');
      statuses.add('overdue');
    }
    if (value === 'Delivered') statuses.add('delivered');
    if (value === 'Cancelled') {
      statuses.add('void');
      statuses.add('cancelled');
    }
  });

  return statuses.size > 0 ? query.in('status', Array.from(statuses)) : query;
}

function parseOrderFilterPreset(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function statusesFromOrderPreset(preset: Record<string, unknown> | null): string[] {
  if (!preset) return [];
  if (preset.status === 'open') return ['Received', 'Confirmed', 'In transit'];
  if (preset.status === 'received') return ['Received'];
  if (preset.status === 'confirmed') return ['Confirmed'];
  return [];
}

function attentionFromOrderPreset(preset: Record<string, unknown> | null): string[] {
  if (preset?.status === 'confirmed' && Number(preset.age_gte_days ?? 0) >= 3) return ['awaiting_dispatch_3d'];
  return [];
}

function applyOrderAttentionFilters(query: any, attentionParams: string[]) {
  let next = query;
  if (attentionParams.includes('awaiting_dispatch_3d')) {
    next = next.eq('status', 'confirmed').lt('confirmed_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());
  }
  return next;
}

function applyOrderSourceFilters<T extends { eq: (column: string, value: unknown) => T; is: (column: string, value: unknown) => T; or: (filter: string) => T }>(
  query: T,
  sourceParams: string[],
): T {
  if (sourceParams.length !== 1) return query;
  const [source] = sourceParams;
  if (source === 'Buyer App') {
    return query.eq('is_buyer_app_order', true).is('estimate_id', null);
  }
  if (source === 'Direct') {
    return query.eq('is_buyer_app_order', false).is('estimate_id', null);
  }
  if (source === 'Converted Estimate') {
    return query.or('estimate_id.not.is.null');
  }
  return query;
}

function applyOrderListFilters<T extends {
  in: (column: string, values: string[]) => T;
  eq: (column: string, value: unknown) => T;
  is: (column: string, value: unknown) => T;
  or: (filter: string) => T;
}>(
  query: T,
  filters: {
    sourceParams: string[];
    statusParams: string[];
    locationParams: string[];
  },
): T {
  let next = query;
  if (filters.locationParams.length > 0) {
    next = next.in('location_id', filters.locationParams);
  }
  if (filters.statusParams.length > 0) {
    next = applyOrderStatusFilters(next, filters.statusParams);
  }
  return applyOrderSourceFilters(next, filters.sourceParams);
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'orders_api', init, APP_GET_CACHE_CONTROL);
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
    const search = req.nextUrl.searchParams.get('search')?.trim() ?? '';
    const filterPreset = parseOrderFilterPreset(req.nextUrl.searchParams.get('filter_preset'));
    const sourceParams = readArrayParam(req.nextUrl.searchParams, 'source');
    const explicitStatusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const explicitAttentionParams = readArrayParam(req.nextUrl.searchParams, 'attention');
    const statusParams = explicitStatusParams.length > 0 ? explicitStatusParams : statusesFromOrderPreset(filterPreset);
    const attentionParams = explicitAttentionParams.length > 0 ? explicitAttentionParams : attentionFromOrderPreset(filterPreset);
    const locationParams = readArrayParam(req.nextUrl.searchParams, 'location_id');
    const cursorParam = req.nextUrl.searchParams.get('cursor');

    const db = supabaseAdmin;
    const availableLocations = await loadAccessibleSellerLocations(db as any, tenantId, claims);
    const [searchScope, numberMatchIds] = search
      ? await Promise.all([
          loadTransactionSearchScopeIds(db, tenantId, search),
          loadTransactionNumberMatchIds(db as any, tenantId, 'order_number', search),
        ])
      : [{ buyerIds: [], locationIds: [] }, []];

    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const buildOrdersPageQuery = () => {
      let query = applySellerLocationScope(
        db
          .schema('app')
          .from('orders')
          .select(ORDER_COLUMNS)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null) as any,
        claims,
      );

      query = applyOrderDocumentPeriod(query, period.current_start, period.current_end_exclusive);
      query = applyOrderListFilters(query, { sourceParams, statusParams, locationParams });
      if (attentionParams.length > 0) query = applyOrderAttentionFilters(query, attentionParams);
      query = applyTransactionTableSearch(query, 'order_number', search, searchScope.buyerIds, searchScope.locationIds, numberMatchIds);
      if (cursorParam) {
        query = applyOrderCursor(query, cursorParam);
      }

      return query
        .order('order_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
    };

    const ordersPageRes = await buildOrdersPageQuery();

    if (ordersPageRes.error) {
      console.error(
        '[GET /api/tenant/orders] query error:',
        ordersPageRes.error,
      );
      return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const allFetchedOrders = (ordersPageRes.data ?? []) as OrderRow[];
    const hasNextPage = allFetchedOrders.length > limit;
    const pageOrders = hasNextPage ? allFetchedOrders.slice(0, limit) : allFetchedOrders;
    const lastOrder = pageOrders.at(-1);
    const nextCursor = hasNextPage && lastOrder
      ? encodeCursor({ created_at: getOrderDocumentTimestamp(lastOrder), id: lastOrder.id })
      : null;
    const uniqueOrders = pageOrders;

    const buyerIds = Array.from(new Set(uniqueOrders.map((order) => order.buyer_id).filter((value): value is string => Boolean(value))));
    const catalogIds = Array.from(new Set(uniqueOrders.map((order) => order.campaign_id).filter((value): value is string => Boolean(value))));
    const estimateIds = Array.from(new Set(uniqueOrders.map((order) => order.estimate_id).filter((value): value is string => Boolean(value))));
    const placedByIds = Array.from(new Set(uniqueOrders.map((order) => order.placed_by).filter((value): value is string => Boolean(value))));

    const [buyersRes, catalogsRes, estimatesRes, placedByMap] = await Promise.all([
      buyerIds.length > 0
        ? db
            .schema('app')
            .from('buyers')
            .select('id, business_name, geography')
            .in('id', buyerIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as BuyerRow[], error: null }),
      catalogIds.length > 0
        ? db.schema('app').from('campaigns').select('id, name').in('id', catalogIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      estimateIds.length > 0
        ? db.schema('app').from('estimates').select('id, estimate_number').in('id', estimateIds).is('deleted_at', null)
        : Promise.resolve({ data: [] as Array<{ id: string; estimate_number: string | null }>, error: null }),
      getAuthUserDisplayNameMap(placedByIds),
    ]);

    if (buyersRes.error || catalogsRes.error || estimatesRes.error) {
      console.error('[GET /api/tenant/orders] supporting query error:', buyersRes.error || catalogsRes.error || estimatesRes.error);
      return timedJson({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const buyers = (buyersRes.data ?? []) as BuyerRow[];
    const catalogById = new Map<string, string>(
      ((catalogsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
    );
    const estimateById = new Map<string, string | null>(
      ((estimatesRes.data ?? []) as Array<{ id: string; estimate_number: string | null }>).map((row) => [row.id, row.estimate_number]),
    );

    const orderIds = uniqueOrders.map((order) => order.id);
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

    const locationNameById = new Map(availableLocations.map((location) => [location.id, location.name]));

    const toLandingRow = (order: OrderRow, index: number) => {
      const buyer = buyerById.get(order.buyer_id);
      const buyerName = buyer?.business_name ?? 'Unknown buyer';
      const geography = (buyer?.geography ?? null) as Record<string, unknown> | null;
      const city = getCity(geography);
      const state = getState(geography);
      const placeOfSupply = (typeof order.place_of_supply === 'string' && order.place_of_supply.trim().length > 0)
        ? order.place_of_supply.trim()
        : city;
      const status = order.status as OrderStatus;
      const meta = statusMeta(status);
      const estimateNumber = order.estimate_id ? estimateById.get(order.estimate_id) ?? null : null;
      const isBuyerAppOrder = order.is_buyer_app_order || order.source === 'buyer_app';
      const hasConvertedEstimate = Boolean(estimateNumber && estimateNumber.trim().length > 0);
      const sourceLinePrimary = hasConvertedEstimate ? estimateNumber ?? '' : isBuyerAppOrder ? 'BUYER_APP' : '';
      const sourceLineSecondary = hasConvertedEstimate && isBuyerAppOrder ? 'BUYER_APP' : '';
      const sourceCategory = orderSourceCategory(order);
      const sourceKind = estimateNumber ? 'converted' : isBuyerAppOrder ? 'buyer_app' : 'direct';

      return {
        id: order.id,
        location_id: order.location_id,
        location_name: order.location_id ? locationNameById.get(order.location_id) ?? null : null,
        order_id: order.order_number,
        buyer_id: order.buyer_id,
        buyer_name: buyerName,
        place_of_supply: placeOfSupply ?? null,
        buyer_city: city === 'Unknown city' ? null : city,
        buyer_state: state,
        buyer_initials: getInitials(buyerName),
        buyer_hue: getHue(index),
        delivery_city: city,
        delivery_label: city,
        source: order.source,
        source_kind: sourceKind,
        source_category: sourceCategory,
        source_label: sourceLinePrimary,
        source_detail: sourceLineSecondary,
        campaign_name: order.campaign_id ? catalogById.get(order.campaign_id) ?? null : null,
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
        placed_at: getOrderDocumentTimestamp(order),
        confirmed_at: order.confirmed_at,
        dispatched_at: order.dispatched_at,
      };
    };
    const rows = pageOrders.map((order, index) => toLandingRow(order, index));
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
          key: 'attention',
          label: 'Attention',
          options: [{ value: 'awaiting_dispatch_3d', label: 'Awaiting dispatch 3+ days' }],
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
      orders: rows,
      filters,
      nextCursor,
      total: null,
    };

    return timedJson(payload);
  } catch (error) {
    console.error('[GET /api/tenant/orders] unexpected error:', error);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }
}

function plusDays(days: number) {
  return offsetIsoDateInTimeZone(new Date(), days);
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
    const draftDate = `${isoDateInTimeZone(new Date())}T00:00:00.000Z`;
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
        order_date: draftDate.slice(0, 10),
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
      const onHandByProduct = await loadInventoryAvailabilityMap(
        db,
        estimateRows
          .map((row) => row.tenant_product_id)
          .filter((value): value is string => typeof value === 'string'),
        resolvedLocationId,
      );

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

    getPostHogClient()?.capture({
      distinctId: claims.sub ?? claims.tenant_id,
      event: 'sales_order_created',
      properties: {
        ...withTenantSellerIds(claims),
        order_id: order.id,
        order_number: orderNumber,
        source: fromEstimateId ? 'estimate_conversion' : 'cockpit_manual',
        item_count: estimateRows.length,
        total_amount: totalAmount,
      },
    });

    return NextResponse.json({
      data: composer,
    });
  } catch (error) {
    console.error('[POST /api/tenant/orders]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
