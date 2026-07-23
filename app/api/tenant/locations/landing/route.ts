import { NextRequest, NextResponse } from 'next/server';

import type {
  LocationsLandingKpis,
  LocationsLandingResponse,
  LocationsLandingRow,
  LocationStockStatus,
} from '@/hooks/useLocations';
import { getVerifiedClaims } from '@/lib/auth';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import { SELLER_LANDING_PERIOD_OPTIONS } from '@/lib/seller-period';
import { parseRowsLimit, parseRowsOffset, SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface LocationSeedRow {
  id: string;
  name: string;
  address: unknown;
  phone_number?: string | null;
  status?: 'active' | 'inactive' | null;
}

interface LocationRowMetric {
  location_id: string;
  sku_count: number | string | null;
  oos_sku_count: number | string | null;
  low_stock_sku_count: number | string | null;
  outstanding_dues: number | string | null;
  oldest_unpaid_days: number | string | null;
  gmv_current: number | string | null;
  active_buyers: number | string | null;
}

interface LocationSnapshotRow {
  location_id: string;
  invoice_count_90d: number | string | null;
  estimate_count_90d: number | string | null;
  estimate_value_90d: number | string | null;
  order_count_90d: number | string | null;
  order_value_90d: number | string | null;
  conversion_90d: number | string | null;
}

interface LocationSearchIdRow {
  id: string;
  total_count: number | string | null;
}

type LocationsSummary = Pick<LocationsLandingResponse, 'kpis' | 'callouts'>;

const EMPTY_KPIS: LocationsLandingKpis = {
  active_locations: 0,
  unpaid_invoice_count: 0,
  total_invoice_count: 0,
  outstanding_dues_total: 0,
  dues_location_count: 0,
  overdue_dues_total: 0,
  overdue_location_count: 0,
  open_estimate_count: 0,
  total_estimate_count: 0,
  conversion_pct: 0,
  top_location_name: null,
  top_location_gmv_share_pct: 0,
  linked_warehouse_count: 0,
  open_primary_demand_kind: 'none',
  open_primary_demand_value: 0,
};

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

const EMPTY_SUMMARY: LocationsSummary = {
  kpis: EMPTY_KPIS,
  callouts: {
    conversions: [],
    top_locations: [],
    collections_overdue: [],
  },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getCity(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const city = (address as Record<string, unknown>).city;
  return typeof city === 'string' ? city.trim() : '';
}

function getAddressText(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const value = address as Record<string, unknown>;
  return [value.line1, value.line2, value.city, value.state, value.pincode]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(', ');
}

function normalizeSummary(value: unknown): LocationsSummary {
  if (!value || typeof value !== 'object') return EMPTY_SUMMARY;
  const summary = value as Partial<LocationsSummary>;
  return {
    kpis: { ...EMPTY_KPIS, ...(summary.kpis ?? {}) },
    callouts: {
      conversions: summary.callouts?.conversions ?? [],
      top_locations: summary.callouts?.top_locations ?? [],
      collections_overdue: summary.callouts?.collections_overdue ?? [],
    },
  };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('locations_landing'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const claims = await getVerifiedClaims(request);
  const adminCheck = assertSellerAdmin(claims);
  if (!adminCheck.ok) {
    return timedJson({ error: adminCheck.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: adminCheck.status });
  }
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  try {
    const tenantId = claims.tenant_id;
    const db = supabaseAdmin as any;
    const period = getSellerLandingPeriodMeta('last90');
    const currentStart = period.current_start.split('T')[0];
    const currentEndExclusive = period.current_end_exclusive.split('T')[0];
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const offset = parseRowsOffset(request.nextUrl.searchParams.get('offset'));
    const includeSummary = request.nextUrl.searchParams.get('include_summary') !== 'false';
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];
    const expiryEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const search = request.nextUrl.searchParams.get('search')?.trim() || '';
    const statusFilters = readArrayParam(request.nextUrl.searchParams, 'status') || [];
    const stockFilters = readArrayParam(request.nextUrl.searchParams, 'stock') || [];
    const duesFilters = readArrayParam(request.nextUrl.searchParams, 'dues') || [];

    // Bounded, indexed ID + count search/pagination — replaces the old
    // full-table JS filter+slice. Rows and per-row metrics below are only
    // ever fetched for this page's IDs, never the whole tenant.
    const searchRes = await db.schema('app').rpc('search_seller_location_landing_ids', {
      p_tenant_id: tenantId,
      p_query: search || null,
      p_statuses: statusFilters.length > 0 ? statusFilters.map((s) => s.toLowerCase()) : null,
      p_stock_modes: stockFilters.length > 0 ? stockFilters : null,
      p_dues_modes: duesFilters.length > 0 ? duesFilters : null,
      p_limit: limit,
      p_offset: offset,
    });
    if (searchRes.error) throw searchRes.error;
    const idRows = (searchRes.data ?? []) as LocationSearchIdRow[];
    const pageIds = idRows.map((row) => row.id).filter(Boolean);
    const total = idRows.length > 0 ? Number(idRows[0].total_count ?? 0) : 0;

    const summaryQuery = includeSummary
      ? db.schema('app').rpc('get_seller_locations_landing_summary', {
          p_tenant_id: tenantId,
          p_location_ids: null,
          p_current_start: currentStart,
          p_current_end_exclusive: currentEndExclusive,
          p_today: todayDate,
          p_expiry_end: expiryEnd,
        })
      : Promise.resolve({ data: null, error: null });
    const seedsQuery = pageIds.length > 0
      ? db.schema('app').from('locations')
          .select('id, name, address, phone_number, status')
          .eq('tenant_id', tenantId)
          .in('id', pageIds)
      : Promise.resolve({ data: [], error: null });
    const rowMetricsQuery = pageIds.length > 0
      ? db.schema('app').rpc('get_seller_location_landing_row_metrics', {
          p_tenant_id: tenantId,
          p_location_ids: pageIds,
          p_current_start: currentStart,
          p_current_end_exclusive: currentEndExclusive,
        })
      : Promise.resolve({ data: [], error: null });
    // Pre-computed snapshot fields — all demand metrics live in metrics_location_snapshot since
    // migration 20260719093500_add_demand_metrics_to_location_snapshot.
    const locationSnapshotQuery = pageIds.length > 0
      ? db.schema('app').from('metrics_location_snapshot')
          .select('location_id, invoice_count_90d, estimate_count_90d, estimate_value_90d, order_count_90d, order_value_90d, conversion_90d')
          .eq('tenant_id', tenantId)
          .in('location_id', pageIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null });

    // Primary demand resolution (spec §2, lines 109-132): Orders win when enabled, else Estimates,
    // else 'none'. Resolved once via the shared RPC — never re-derived from activity heuristics.
    const demandKindQuery = includeSummary
      ? db.schema('app').rpc('metrics_v2_primary_demand_kind', { p_tenant_id: tenantId })
      : Promise.resolve({ data: null, error: null });
    const linkedWarehouseCountQuery = includeSummary
      ? db.schema('app').from('warehouses')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .not('location_id', 'is', null)
          .is('deleted_at', null)
      : Promise.resolve({ count: 0, error: null });

    const [summaryRes, seedsRes, rowMetricsRes, locationSnapshotRes, demandKindRes, linkedWarehouseCountRes] = await Promise.all([
      summaryQuery,
      seedsQuery,
      rowMetricsQuery,
      locationSnapshotQuery,
      demandKindQuery,
      linkedWarehouseCountQuery,
    ]);
    if (summaryRes.error) throw summaryRes.error;
    if (seedsRes.error) throw seedsRes.error;
    if (rowMetricsRes.error) throw rowMetricsRes.error;
    if (locationSnapshotRes.error) throw locationSnapshotRes.error;
    if (demandKindRes.error) throw demandKindRes.error;
    if (linkedWarehouseCountRes.error) throw linkedWarehouseCountRes.error;

    const primaryDemandKind = (typeof demandKindRes.data === 'string' ? demandKindRes.data : 'none') as
      | 'orders'
      | 'estimates'
      | 'none';
    const linkedWarehouseCount = Number(linkedWarehouseCountRes.count ?? 0);

    // "Open primary demand value" (doc line 801): open estimate value for Estimate-primary tenants,
    // open order value for Order-primary tenants. Reuses app.estimates/app.orders directly, scoped to
    // location-linked rows and the exact open-status sets from app.estimate_status_is_open /
    // app.order_status_is_open (supabase/migrations/20260709000001_prod_bootstrap.sql). Bounded with a
    // generous safety .limit() per the SUM-aggregate exception to the list-page row cap.
    let openPrimaryDemandValue = 0;
    if (includeSummary && primaryDemandKind === 'estimates') {
      const { data, error } = await db.schema('app')
        .from('estimates')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .not('location_id', 'is', null)
        .is('deleted_at', null)
        .in('status', OPEN_ESTIMATE_STATUSES)
        .limit(10000);
      if (error) throw error;
      openPrimaryDemandValue = ((data ?? []) as Array<{ total_amount: number | string | null }>).reduce(
        (sum, row) => sum + Number(row.total_amount ?? 0), 0,
      );
    } else if (includeSummary && primaryDemandKind === 'orders') {
      const { data, error } = await db.schema('app')
        .from('orders')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .not('location_id', 'is', null)
        .is('deleted_at', null)
        .in('status', OPEN_ORDER_STATUSES)
        .limit(10000);
      if (error) throw error;
      openPrimaryDemandValue = ((data ?? []) as Array<{ total_amount: number | string | null }>).reduce(
        (sum, row) => sum + Number(row.total_amount ?? 0), 0,
      );
    }

    const seedsById = new Map(((seedsRes.data ?? []) as LocationSeedRow[]).map((row) => [row.id, row]));
    const rowMetricsById = new Map(
      ((rowMetricsRes.data ?? []) as LocationRowMetric[]).map((row) => [String(row.location_id), row]),
    );

    // All demand + invoice metrics come from metrics_location_snapshot (one row per location)
    const snapshotByLocation = new Map<string, LocationSnapshotRow>(
      ((locationSnapshotRes.data ?? []) as LocationSnapshotRow[]).map((r) => [String(r.location_id), r]),
    );

    const locations: LocationsLandingRow[] = pageIds
      .map((id) => seedsById.get(id))
      .filter((seed): seed is LocationSeedRow => Boolean(seed))
      .map((seed) => {
        const metrics = rowMetricsById.get(seed.id);
        const outOfStock = Number(metrics?.oos_sku_count ?? 0);
        const lowStock = Number(metrics?.low_stock_sku_count ?? 0);
        const stockStatus: LocationStockStatus = outOfStock > 0 ? 'out_of_stock' : lowStock > 0 ? 'low_stock' : 'clear';
        const gmvCurrent = Number(metrics?.gmv_current ?? 0);
        const snap = snapshotByLocation.get(seed.id);
        return {
          id: seed.id,
          name: seed.name,
          city: getCity(seed.address),
          address_text: getAddressText(seed.address),
          phone_number: seed.phone_number ?? null,
          initials: getInitials(seed.name),
          gmv_mtd: gmvCurrent,
          active_buyers: Number(metrics?.active_buyers ?? 0),
          outstanding_dues: Number(metrics?.outstanding_dues ?? 0),
          sku_count: Number(metrics?.sku_count ?? 0),
          oos_sku_count: outOfStock,
          low_stock_sku_count: lowStock,
          stock_status: stockStatus,
          oldest_unpaid_days: metrics?.oldest_unpaid_days != null ? Number(metrics.oldest_unpaid_days) : null,
          is_active: seed.status !== 'inactive',
          invoice_count_90d: Number(snap?.invoice_count_90d ?? 0),
          estimate_count_90d: Number(snap?.estimate_count_90d ?? 0),
          estimate_value_90d: Number(snap?.estimate_value_90d ?? 0),
          order_count_90d: Number(snap?.order_count_90d ?? 0),
          order_value_90d: Number(snap?.order_value_90d ?? 0),
          conversion_90d: Number(snap?.conversion_90d ?? 0),
        };
      });

    const summary: LocationsSummary = includeSummary ? normalizeSummary(summaryRes.data) : EMPTY_SUMMARY;
    if (includeSummary) {
      summary.kpis.linked_warehouse_count = linkedWarehouseCount;
      summary.kpis.open_primary_demand_kind = primaryDemandKind;
      summary.kpis.open_primary_demand_value = openPrimaryDemandValue;
    }
    const response: LocationsLandingResponse = {
      ...summary,
      locations,
      total,
      limit,
      offset,
      nextOffset: locations.length > 0 && offset + locations.length < total ? offset + locations.length : null,
      period: SELLER_LANDING_PERIOD_OPTIONS.find((option) => option.value === period.selected)?.label ?? period.selected,
      refreshed_at: new Date().toISOString(),
      as_of: new Date().toISOString(),
      commercial_horizon_days: 90,
    };
    return timedJson(response);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[GET /api/tenant/locations/landing]', err?.code, err?.message);
    return timedJson({ error: 'Failed to fetch locations landing' }, { status: 500 });
  }
}
