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
  LocationDetailOrder,
  LocationDetailActivityItem,
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

function sumNumberField(rows: Array<Record<string, unknown>>, field: string): number {
  return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}

/** Statuses mirroring app.estimate_status_is_open / app.order_status_is_open (SQL, prod_bootstrap migration). */
const OPEN_ESTIMATE_STATUSES = ['draft', 'sent'];
const OPEN_ORDER_STATUSES = [
  'draft',
  'open',
  'accepted',
  'received',
  'confirmed',
  'partially_dispatched',
  'dispatched',
  'partially_invoiced',
  'overdue',
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const includePerformance = request.nextUrl.searchParams.get('include_performance') !== 'false';
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
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as any;
  const tenantId = claims.tenant_id;

  const { data: baseLocation, error: locationError } = await db
    .schema('app')
    .from('locations')
    .select('id, tenant_id, name, address, phone_number, status, associated_users, deleted_at, created_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (locationError || !baseLocation) {
    return timedJson({ error: 'Not found' }, { status: 404 });
  }

  const [detailV2Res, ordersRes, estimatesRes, invoicesRes, activityRes, demandKindRes] = await Promise.all([
    db.schema('app').rpc('get_seller_location_detail_v2', {
      p_tenant_id: tenantId,
      p_location_id: id,
    }),
    db
      .schema('app')
      .from('orders')
      .select('id, order_number, buyer_id, location_id, total_amount, status, source, is_buyer_app_order, campaign_id, estimate_id, place_of_supply, placed_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .not('status', 'in', '("cancelled","draft")')
      .is('deleted_at', null)
      .order('placed_at', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('estimates')
      .select('id, estimate_number, buyer_id, location_id, status, source, is_buyer_app_estimate, campaign_id, place_of_supply, total_amount, estimate_date, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .is('deleted_at', null)
      .order('estimate_date', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('invoices')
      .select('id, invoice_number, buyer_id, location_id, order_id, estimate_id, is_buyer_app_invoice, outstanding_balance, status, invoice_date, due_date, created_at, created_by, place_of_supply, total_amount')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .limit(20),
    db
      .schema('app')
      .from('audit_log')
      .select('id, action, entity_type, diff, ts, actor_user_id')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'location')
      .eq('entity_id', id)
      .order('ts', { ascending: false })
      .limit(20),
    // Primary demand resolution (spec §2, lines 109-132): Orders win when enabled, else Estimates,
    // else 'none'. Resolved once via the shared RPC — never re-derived from activity heuristics.
    db.schema('app').rpc('metrics_v2_primary_demand_kind', { p_tenant_id: tenantId }),
  ]);

  const firstError =
    detailV2Res.error ?? ordersRes.error ?? estimatesRes.error ?? invoicesRes.error ?? activityRes.error ?? demandKindRes.error;
  if (firstError) {
    console.error('[GET /api/tenant/locations/[id]/detail]', firstError.code, firstError.message);
    return timedJson({ error: 'Failed to fetch location detail data' }, { status: 500 });
  }

  const detailV2 = (detailV2Res.data ?? {}) as any;
  const kpiByLabel = new Map<string, any>((detailV2.kpi_grid ?? []).map((item: any) => [String(item.label), item.value]));
  const trendCard = (detailV2.performance_cards ?? []).find((card: any) => card.id === 'sales-over-time');
  const trendPoints = trendCard?.body?.points ?? [];
  const gmv_mtd = Number(kpiByLabel.get('Invoiced sales 90D') ?? 0);
  const overdue_amount = Number(kpiByLabel.get('Overdue') ?? 0);
  const purchasingCustomers = Number(kpiByLabel.get('Purchasing customers 90D') ?? 0);
  const invoices = invoicesRes.data ?? [];
  const estimates = estimatesRes.data ?? [];
  const orders = ordersRes.data ?? [];

  const primaryDemandKind = (typeof demandKindRes.data === 'string' ? demandKindRes.data : 'none') as
    | 'orders'
    | 'estimates'
    | 'none';

  // "Open primary demand value" (doc line 830): open estimate value for Estimate-primary tenants,
  // open order value for Order-primary tenants, scoped to this location. Reuses app.estimates/
  // app.orders directly with the exact open-status sets from app.estimate_status_is_open /
  // app.order_status_is_open (supabase/migrations/20260709000001_prod_bootstrap.sql).
  let openPrimaryDemandValue = 0;
  let openPrimaryDemandCount = 0;
  if (primaryDemandKind === 'estimates') {
    const { data, error } = await db
      .schema('app')
      .from('estimates')
      .select('total_amount')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .is('deleted_at', null)
      .in('status', OPEN_ESTIMATE_STATUSES)
      .limit(2000);
    if (error) {
      console.error('[GET /api/tenant/locations/[id]/detail] open estimate value', error.code, error.message);
      return timedJson({ error: 'Failed to fetch location detail data' }, { status: 500 });
    }
    const rows = (data ?? []) as Array<{ total_amount: number | string | null }>;
    openPrimaryDemandCount = rows.length;
    openPrimaryDemandValue = rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  } else if (primaryDemandKind === 'orders') {
    const { data, error } = await db
      .schema('app')
      .from('orders')
      .select('total_amount')
      .eq('tenant_id', tenantId)
      .eq('location_id', id)
      .is('deleted_at', null)
      .in('status', OPEN_ORDER_STATUSES)
      .limit(2000);
    if (error) {
      console.error('[GET /api/tenant/locations/[id]/detail] open order value', error.code, error.message);
      return timedJson({ error: 'Failed to fetch location detail data' }, { status: 500 });
    }
    const rows = (data ?? []) as Array<{ total_amount: number | string | null }>;
    openPrimaryDemandCount = rows.length;
    openPrimaryDemandValue = rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  }

  const buyerIds = Array.from(new Set([
    ...orders.map((row: any) => row.buyer_id).filter(Boolean),
    ...estimates.map((row: any) => row.buyer_id).filter(Boolean),
    ...invoices.map((row: any) => row.buyer_id).filter(Boolean),
  ]));
  const { data: buyers } = buyerIds.length
    ? await db.schema('app').from('buyers').select('id, business_name, geography').eq('tenant_id', tenantId).in('id', buyerIds)
    : { data: [] };
  const buyerById = new Map<string, any>((buyers ?? []).map((buyer: any) => [buyer.id, buyer]));

  const response: LocationDetailResponse & { performance_cards: any[]; detail_v2: any } = {
    id: baseLocation.id,
    name: baseLocation.name,
    city: getCity(baseLocation.address),
    phone_number: typeof baseLocation.phone_number === 'string' ? baseLocation.phone_number : null,
    status: baseLocation.status === 'inactive' ? 'inactive' : 'active',
    initials: getInitials(baseLocation.name),
    is_active: baseLocation.status !== 'inactive',
    associated_users: normalizeLocationAssociatedUsers(baseLocation.associated_users),
    meta_strip: {
      gmv_mtd,
      outstanding_dues: overdue_amount,
      overdue_amount,
      invoice_count: invoices.length,
      unpaid_invoice_count: invoices.filter((invoice: any) => Number(invoice.outstanding_balance ?? 0) > 0).length,
      total_invoice_count: invoices.length,
      open_estimate_count: estimates.filter((estimate: any) => !['converted', 'expired', 'void'].includes(String(estimate.status))).length,
      total_estimate_count: estimates.length,
      purchasing_customers_90d: purchasingCustomers,
      open_primary_demand_kind: primaryDemandKind,
      open_primary_demand_value: openPrimaryDemandValue,
      open_primary_demand_count: openPrimaryDemandCount,
    },
    overview: {
      gmv_trend: trendPoints.map((point: any) => ({
        week_label: String(point.month ?? point.label ?? 'Period'),
        week_start: String(point.month ?? point.label ?? ''),
        gmv: Number(point.value ?? 0),
        orders_count: 0,
      })),
      inventory_health: {
        active_skus: 0,
        oos_skus: 0,
        low_stock_skus: 0,
        avg_days_cover: null,
      },
      top_buyers: purchasingCustomers > 0 ? [{
        buyer_id: 'aggregate',
        business_name: 'Purchasing customers',
        city: getCity(baseLocation.address),
        initials: 'PC',
        spend_mtd: gmv_mtd,
        outstanding_dues: overdue_amount,
      }] : [],
    },
    orders: orders.map((order: any) => {
      const buyer = buyerById.get(order.buyer_id);
      return {
        order_id: order.id,
        order_number: order.order_number,
        placed_at: order.placed_at ?? order.created_at,
        buyer_name: buyer?.business_name ?? 'Buyer',
        place_of_supply: order.place_of_supply,
        location_name: baseLocation.name,
        source_kind: order.is_buyer_app_order ? 'buyer_app' : order.estimate_id ? 'converted' : 'direct',
        source_label: order.source,
        campaign_name: null,
        items_count: 0,
        total_amount: Number(order.total_amount ?? 0),
        status: order.status,
      };
    }),
    estimates: estimates.map((estimate: any) => {
      const buyer = buyerById.get(estimate.buyer_id);
      return {
        estimate_id: estimate.id,
        estimate_number: estimate.estimate_number,
        issued_at: estimate.estimate_date ?? estimate.created_at,
        buyer_name: buyer?.business_name ?? 'Buyer',
        place_of_supply: estimate.place_of_supply,
        location_name: baseLocation.name,
        source_kind: estimate.is_buyer_app_estimate ? 'buyer_app' : 'seller',
        source_label: estimate.source,
        campaign_name: null,
        items_count: 0,
        total_amount: Number(estimate.total_amount ?? 0),
        expires_at: estimate.expires_at,
        status: estimate.status,
      };
    }),
    invoices: invoices.map((invoice: any) => {
      const buyer = buyerById.get(invoice.buyer_id);
      return {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        issued_at: invoice.invoice_date ?? invoice.created_at,
        buyer_name: buyer?.business_name ?? 'Buyer',
        place_of_supply: invoice.place_of_supply,
        location_name: baseLocation.name,
        source_kind: invoice.is_buyer_app_invoice ? 'buyer_app' : invoice.estimate_id ? 'converted' : 'direct',
        source_label: null,
        campaign_name: null,
        items_count: 0,
        total_amount: Number(invoice.total_amount ?? 0),
        outstanding_amount: Number(invoice.outstanding_balance ?? 0),
        due_date: invoice.due_date,
        status: invoice.status,
      };
    }),
    activity: (activityRes.data ?? []).map((row: any) => ({
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      diff: row.diff,
      ts: row.ts,
      actor_name: row.actor_user_id,
    })),
    tab_badges: {
      orders_mtd: orders.length,
      estimates_mtd: estimates.length,
      invoices_mtd: invoices.length,
    },
    performance_cards: includePerformance ? (detailV2.performance_cards ?? []) : [],
    detail_v2: includePerformance ? detailV2 : null,
  };

  return timedJson(response);
}
