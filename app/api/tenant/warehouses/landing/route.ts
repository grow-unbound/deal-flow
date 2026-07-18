import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { SELLER_CACHE_REFERENCE, parseRowsLimit, parseRowsOffset } from '@/lib/server/bounded-get';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { computeWarehouseInitials } from '@/lib/server/warehouse-metrics';
import { hydrateWarehouse } from '@/lib/server/warehouse-data';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  WarehousesLandingCalloutRow,
  WarehousesLandingKpis,
  WarehousesLandingResponse,
  WarehousesLandingRow,
  WarehouseStockStatus,
} from '@/types/tenant-warehouses';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

function overallStockStatus(lowStockSkus: number, stockoutSkus: number): WarehouseStockStatus {
  if (stockoutSkus > 0) return 'out_of_stock';
  if (lowStockSkus > 0) return 'low_stock';
  return 'clear';
}

interface WarehouseMetricsRow {
  warehouse_id: string;
  tracked_skus: number | string | null;
  sellable_units: number | string | null;
  low_stock_skus: number | string | null;
  stockout_skus: number | string | null;
  idle_stock_skus: number | string | null;
  last_inventory_update: string | null;
}

interface WarehouseSummaryRpcRow {
  id: string;
  name: string;
  city: string;
  value: number | string;
  last_updated?: string | null;
}

interface WarehouseSummaryRpcResult {
  kpis?: Partial<Record<keyof WarehousesLandingKpis, number | string>>;
  callouts?: {
    stock_attention?: WarehouseSummaryRpcRow[];
    idle_stock?: WarehouseSummaryRpcRow[];
    recently_replenished?: WarehouseSummaryRpcRow[];
  };
}

interface WarehouseSearchIdRow {
  id: string;
  total_count: number | string | null;
}

const EMPTY_KPIS: WarehousesLandingKpis = {
  active_warehouses: 0,
  tracked_skus: 0,
  low_stock_warehouses: 0,
  idle_stock_skus: 0,
  warehouse_count: 0,
  location_count: 0,
};

const EMPTY_CALLOUTS = {
  stock_attention: [] as WarehousesLandingCalloutRow[],
  idle_stock: [] as WarehousesLandingCalloutRow[],
  recently_replenished: [] as WarehousesLandingCalloutRow[],
};

function normalizeSummaryCallout(row: WarehouseSummaryRpcRow): WarehousesLandingCalloutRow {
  return {
    id: row.id,
    name: row.name,
    initials: computeWarehouseInitials(row.name),
    city: row.city ?? '',
    value: Number(row.value ?? 0),
    ...(row.last_updated ? { last_updated: row.last_updated } : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }
    if (!claims.role?.startsWith('seller_')) {
      return jsonError(403, 'Forbidden', 'FORBIDDEN');
    }
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const period = 'today';
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusFilters = request.nextUrl.searchParams.getAll('status');
    const stockFilters = request.nextUrl.searchParams.getAll('stock');
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const offset = parseRowsOffset(request.nextUrl.searchParams.get('offset'));
    const includeSummary = request.nextUrl.searchParams.get('include_summary') !== 'false';
    const db = supabaseAdmin as any;
    const locationScope = getSellerLocationScope({
      role: claims.role ?? null,
      location_ids: claims.location_ids ?? null,
    });
    if (locationScope.mode === 'none') {
      const emptyResponse: WarehousesLandingResponse = {
        kpis: {
          active_warehouses: 0,
          tracked_skus: 0,
          low_stock_warehouses: 0,
          idle_stock_skus: 0,
          warehouse_count: 0,
          location_count: 0,
        },
        callouts: {
          stock_attention: [],
          idle_stock: [],
          recently_replenished: [],
        },
        warehouses: [],
        total: 0,
        period,
        refreshed_at: new Date().toISOString(),
        as_of: new Date().toISOString(),
        commercial_horizon_days: 90,
      };

      return NextResponse.json(emptyResponse, { status: 200, headers: SELLER_CACHE_REFERENCE });
    }

    const locationIdsForRpc = locationScope.mode === 'subset' ? locationScope.locationIds : null;

    // Bounded, indexed ID + count search/pagination — replaces the old
    // full-tenant-load-then-JS-filter-then-slice. Rows and per-row metrics
    // below are only ever fetched for this page's IDs, never every warehouse.
    const searchRes = await db.schema('app').rpc('search_seller_warehouse_landing_ids_v2', {
      p_tenant_id: claims.tenant_id,
      p_query: search || null,
      p_statuses: statusFilters.length > 0 ? statusFilters.map((s) => s.toLowerCase()) : null,
      p_stock_modes: stockFilters.length > 0 ? stockFilters : null,
      p_location_ids: locationIdsForRpc,
      p_limit: limit,
      p_offset: offset,
    });
    if (searchRes.error) throw searchRes.error;
    const idRows = (searchRes.data ?? []) as WarehouseSearchIdRow[];
    const pageIds = idRows.map((row) => row.id).filter(Boolean);
    const total = idRows.length > 0 ? Number(idRows[0].total_count ?? 0) : 0;

    const summaryQuery = includeSummary
      ? db.schema('app').rpc('get_seller_warehouses_landing_summary_v2', {
          p_tenant_id: claims.tenant_id,
          p_location_ids: locationIdsForRpc,
        })
      : Promise.resolve({ data: null, error: null });

    // Subtitle context (doc line 856): "{warehouse_count} warehouses across {location_count} locations."
    // Unfiltered by search/status/stock — always reflects full scope, not the current page.
    const subtitleCountsQuery = includeSummary
      ? (() => {
          let query = db.schema('app').from('warehouses').select('id, location_id').eq('tenant_id', claims.tenant_id).is('deleted_at', null);
          if (locationIdsForRpc) query = query.in('location_id', locationIdsForRpc);
          return query.limit(5000);
        })()
      : Promise.resolve({ data: [], error: null });

    const rowsQuery = pageIds.length > 0
      ? db
          .schema('app')
          .from('warehouses')
          .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default)')
          .eq('tenant_id', claims.tenant_id)
          .in('id', pageIds)
      : Promise.resolve({ data: [], error: null });

    const pageMetricsQuery = pageIds.length > 0
      ? db
          .schema('app')
          .rpc('get_seller_warehouse_landing_row_metrics_v2', {
            p_tenant_id: claims.tenant_id,
            p_warehouse_ids: pageIds,
          })
      : Promise.resolve({ data: [], error: null });

    const [summaryRes, rowsRes, pageMetricsRes, subtitleCountsRes] = await Promise.all([
      summaryQuery,
      rowsQuery,
      pageMetricsQuery,
      subtitleCountsQuery,
    ]);

    if (summaryRes.error) throw summaryRes.error;
    if (rowsRes.error) throw rowsRes.error;
    if (pageMetricsRes.error) throw pageMetricsRes.error;
    if (subtitleCountsRes.error) throw subtitleCountsRes.error;

    const metricsByWarehouse = new Map<string, WarehouseMetricsRow>();
    for (const row of (pageMetricsRes.data ?? []) as WarehouseMetricsRow[]) {
      metricsByWarehouse.set(String(row.warehouse_id), row);
    }

    const subtitleRows = (subtitleCountsRes.data ?? []) as Array<{ id: string; location_id: string | null }>;
    const warehouseCount = subtitleRows.length;
    const locationCount = new Set(subtitleRows.map((row) => row.location_id).filter((value): value is string => Boolean(value))).size;

    const summary = (summaryRes.data ?? {}) as WarehouseSummaryRpcResult;
    const kpis: WarehousesLandingKpis = includeSummary
      ? {
          active_warehouses: Number(summary.kpis?.active_warehouses ?? 0),
          tracked_skus: Number(summary.kpis?.tracked_skus ?? 0),
          low_stock_warehouses: Number(summary.kpis?.low_stock_warehouses ?? 0),
          idle_stock_skus: Number(summary.kpis?.idle_stock_skus ?? 0),
          warehouse_count: warehouseCount,
          location_count: locationCount,
        }
      : EMPTY_KPIS;
    const callouts = includeSummary
      ? {
          stock_attention: (summary.callouts?.stock_attention ?? []).map(normalizeSummaryCallout),
          idle_stock: (summary.callouts?.idle_stock ?? []).map(normalizeSummaryCallout),
          recently_replenished: (summary.callouts?.recently_replenished ?? []).map(normalizeSummaryCallout),
        }
      : EMPTY_CALLOUTS;

    const rowsById = new Map(((rowsRes.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), row]));
    const pagedRows: WarehousesLandingRow[] = pageIds
      .map((id) => rowsById.get(id))
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row) => hydrateWarehouse(row))
      .map((warehouse) => {
        const snapshot = metricsByWarehouse.get(warehouse.id);
        const trackedSkus = Number(snapshot?.tracked_skus ?? 0);
        const sellableUnits = Number(snapshot?.sellable_units ?? 0);
        const lowStockSkus = Number(snapshot?.low_stock_skus ?? 0);
        const stockoutSkus = Number(snapshot?.stockout_skus ?? 0);
        const idleStockSkus = Number(snapshot?.idle_stock_skus ?? 0);
        const lastUpdated = snapshot?.last_inventory_update ?? warehouse.updated_at;

        return {
          id: warehouse.id,
          name: warehouse.name,
          initials: computeWarehouseInitials(warehouse.name),
          city: warehouse.address.city,
          state: warehouse.address.state,
          linked_location_name: warehouse.location?.name ?? null,
          status: warehouse.status,
          is_default: warehouse.is_default,
          tracked_skus: trackedSkus,
          sellable_units: sellableUnits,
          low_stock_skus: lowStockSkus,
          stockout_skus: stockoutSkus,
          idle_stock_skus: idleStockSkus,
          stock_status: overallStockStatus(lowStockSkus, stockoutSkus),
          last_updated: lastUpdated,
          associated_users_count: warehouse.associated_users.length,
        };
      });

    const response: WarehousesLandingResponse = {
      kpis,
      callouts,
      warehouses: pagedRows,
      total,
      limit,
      offset,
      nextOffset: pagedRows.length > 0 && offset + pagedRows.length < total
        ? offset + pagedRows.length
        : null,
      period,
      refreshed_at: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200, headers: SELLER_CACHE_REFERENCE });
  } catch (error) {
    console.error('[GET /api/tenant/warehouses/landing]', error);
    return jsonError(500, 'Failed to load warehouses landing', 'LOAD_FAILED');
  }
}
