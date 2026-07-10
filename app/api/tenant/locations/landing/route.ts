import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { createTimer } from '@/lib/server-timing';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { supabaseAdmin } from '@/lib/supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { SELLER_LANDING_PERIOD_OPTIONS } from '@/lib/seller-period';
import { readArrayParam } from '@/lib/landing-filter-params';
import type {
  LocationsLandingKpis,
  LocationsLandingRow,
  LocationsCalloutRow,
  LocationsLandingResponse,
  LocationStockStatus,
} from '@/hooks/useLocations';

export const dynamic = 'force-dynamic';

interface LocationSeedRow {
  id: string;
  name: string;
  address: unknown;
  deleted_at: string | null;
}

interface LocationSnapshotRow {
  location_id: string;
  sku_count: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
  outstanding_dues: number;
  oldest_unpaid_days: number | null;
}

interface LocationKpiRow {
  location_id: string | null;
  gmv: number | null;
  orders_count: number | null;
}

function buildPeriodFallbackFilter(
  dateColumn: string,
  fallbackColumn: string,
  start: string,
  endExclusive: string,
) {
  return `and(${dateColumn}.gte.${start},${dateColumn}.lt.${endExclusive}),and(${dateColumn}.is.null,${fallbackColumn}.gte.${start},${fallbackColumn}.lt.${endExclusive})`;
}

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
    const addr = address as Record<string, unknown>;
    if (typeof addr.city === 'string' && addr.city.trim()) return addr.city.trim();
  }
  return '';
}

function getAddressText(address: unknown): string {
  if (!address || typeof address !== 'object') return '';
  const addr = address as Record<string, unknown>;
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.join(', ');
}

async function getLocationsLandingPayload(
  db: any,
  tenantId: string,
  periodInput?: string | null,
  filters?: {
    search: string;
    status: string[];
    stock: string[];
    dues: string[];
  },
): Promise<LocationsLandingResponse> {
  const period = getSellerLandingPeriodMeta(periodInput);

  const [summaryLocationsRes, summarySnapshotRes, summaryCurrentKpiRes, rowsRes, totalInvoiceCountRes, periodEstimatesRes] = await Promise.all([
    db
      .schema('app')
      .from('locations')
      .select('id, name, address, deleted_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
    db
      .schema('app')
      .from('locations_snapshot')
      .select('location_id, sku_count, oos_sku_count, low_stock_sku_count, outstanding_dues, oldest_unpaid_days, invoice_count')
      .eq('tenant_id', tenantId),
    db
      .schema('app')
      .from('kpi_location_daily')
      .select('location_id, gmv, orders_count')
      .eq('tenant_id', tenantId)
      .gte('day', period.current_start.split('T')[0])
      .lt('day', period.current_end_exclusive.split('T')[0]),
    db
      .schema('app')
      .from('locations')
      .select('id, name, address, deleted_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
    // Total invoice count (all statuses, not deleted) for "of X total" sub-label
    db
      .schema('app')
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    // Current-period estimates with status for open/total counts
    db
      .schema('app')
      .from('estimates')
      .select('status')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('estimate_date', period.current_start.split('T')[0])
      .lt('estimate_date', period.current_end_exclusive.split('T')[0]),
  ]);

  if (summaryLocationsRes.error) throw summaryLocationsRes.error;
  if (summarySnapshotRes.error || summaryCurrentKpiRes.error || rowsRes.error || totalInvoiceCountRes.error || periodEstimatesRes.error) {
    throw summarySnapshotRes.error ?? summaryCurrentKpiRes.error ?? rowsRes.error ?? totalInvoiceCountRes.error ?? periodEstimatesRes.error;
  }

  const summaryLocations: LocationSeedRow[] = (summaryLocationsRes.data ?? []) as LocationSeedRow[];
  const rowSeeds: LocationSeedRow[] = (rowsRes.data ?? []) as LocationSeedRow[];
  const summarySnapshots: LocationSnapshotRow[] = ((summarySnapshotRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    location_id: String(row.location_id),
    sku_count: Number(row.sku_count ?? 0),
    oos_sku_count: Number(row.oos_sku_count ?? 0),
    low_stock_sku_count: Number(row.low_stock_sku_count ?? 0),
    outstanding_dues: Number(row.outstanding_dues ?? 0),
    oldest_unpaid_days: row.oldest_unpaid_days == null ? null : Number(row.oldest_unpaid_days),
  }));
  const summaryCurrentKpis: LocationKpiRow[] = summaryCurrentKpiRes.data ?? [];

  const rowIds = rowSeeds.map((loc) => loc.id);
  const summaryByLocation = new Map<string, { seed: LocationSeedRow; snapshot?: LocationSnapshotRow; gmv_mtd: number; orders_count: number }>();
  for (const seed of summaryLocations) {
    summaryByLocation.set(seed.id, {
      seed,
      gmv_mtd: 0,
      orders_count: 0,
    });
  }
  for (const snapshot of summarySnapshots) {
    const entry = summaryByLocation.get(snapshot.location_id);
    if (entry) entry.snapshot = snapshot;
  }
  for (const kpi of summaryCurrentKpis) {
    if (!kpi.location_id) continue;
    const entry = summaryByLocation.get(kpi.location_id);
    if (!entry) continue;
    entry.gmv_mtd += Number(kpi.gmv ?? 0);
    entry.orders_count += Number(kpi.orders_count ?? 0);
  }

  const scopedRowIds = rowIds.length > 0 ? rowIds : ['00000000-0000-0000-0000-000000000000'];

  const rowSnapshotQuery = (() => {
    let query = db
      .schema('app')
      .from('locations_snapshot')
      .select('location_id, sku_count, oos_sku_count, low_stock_sku_count, outstanding_dues, oldest_unpaid_days')
      .eq('tenant_id', tenantId)
      .in('location_id', scopedRowIds);

    return query;
  })();

  const rowCurrentKpiQuery = (() => {
    let query = db
      .schema('app')
      .from('kpi_location_daily')
      .select('location_id, gmv, orders_count')
      .eq('tenant_id', tenantId)
      .gte('day', period.current_start.split('T')[0])
      .lt('day', period.current_end_exclusive.split('T')[0])
      .in('location_id', scopedRowIds);

    return query;
  })();

  const rowPrevKpiQuery = (() => {
    let query = db
      .schema('app')
      .from('kpi_location_daily')
      .select('location_id, gmv')
      .eq('tenant_id', tenantId)
      .gte('day', period.previous_start.split('T')[0])
      .lt('day', period.previous_end_exclusive.split('T')[0])
      .in('location_id', scopedRowIds);

    return query;
  })();

  const rowOrderBuyerQuery = (() => {
    let query = db
      .schema('app')
      .from('orders')
      .select('buyer_id, location_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or(buildPeriodFallbackFilter('order_date', 'created_at', period.current_start, period.current_end_exclusive))
      .in('location_id', scopedRowIds);

    return query;
  })();

  const rowEstimateBuyerQuery = (() => {
    let query = db
      .schema('app')
      .from('estimates')
      .select('buyer_id, location_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or(buildPeriodFallbackFilter('estimate_date', 'created_at', period.current_start, period.current_end_exclusive))
      .in('location_id', scopedRowIds);

    return query;
  })();

  const rowInvoiceBuyerQuery = (() => {
    let query = db
      .schema('app')
      .from('invoices')
      .select('buyer_id, location_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or(buildPeriodFallbackFilter('invoice_date', 'created_at', period.current_start, period.current_end_exclusive))
      .in('location_id', scopedRowIds);

    return query;
  })();

  const [rowSnapshotRes, rowCurrentKpiRes, rowPrevKpiRes, rowOrdersRes, rowEstimatesRes, rowInvoicesRes] = await Promise.all([
    rowSnapshotQuery,
    rowCurrentKpiQuery,
    rowPrevKpiQuery,
    rowOrderBuyerQuery,
    rowEstimateBuyerQuery,
    rowInvoiceBuyerQuery,
  ]);

  if (rowSnapshotRes.error || rowCurrentKpiRes.error || rowPrevKpiRes.error || rowOrdersRes.error || rowEstimatesRes.error || rowInvoicesRes.error) {
    throw rowSnapshotRes.error ?? rowCurrentKpiRes.error ?? rowPrevKpiRes.error ?? rowOrdersRes.error ?? rowEstimatesRes.error ?? rowInvoicesRes.error;
  }

  const rowSnapshots: LocationSnapshotRow[] = ((rowSnapshotRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    location_id: String(row.location_id),
    sku_count: Number(row.sku_count ?? 0),
    oos_sku_count: Number(row.oos_sku_count ?? 0),
    low_stock_sku_count: Number(row.low_stock_sku_count ?? 0),
    outstanding_dues: Number(row.outstanding_dues ?? 0),
    oldest_unpaid_days: row.oldest_unpaid_days == null ? null : Number(row.oldest_unpaid_days),
  }));
  const rowCurrentKpis: LocationKpiRow[] = rowCurrentKpiRes.data ?? [];
  const rowPrevKpis: Array<{ location_id: string | null; gmv: number | null }> = rowPrevKpiRes.data ?? [];
  const rowOrders: Array<{ location_id: string | null; buyer_id: string }> = rowOrdersRes.data ?? [];
  const rowEstimates: Array<{ location_id: string | null; buyer_id: string }> = rowEstimatesRes.data ?? [];
  const rowInvoices: Array<{ location_id: string | null; buyer_id: string }> = rowInvoicesRes.data ?? [];

  const locationIds = rowSeeds.map((loc) => loc.id);
  let extraById = new Map<
    string,
    { phone_number: string | null; status: 'active' | 'inactive' | null }
  >();
  if (locationIds.length > 0) {
    try {
      const { data: extraRows } = await db
        .schema('app')
        .from('locations')
        .select('id, phone_number, status')
        .eq('tenant_id', tenantId)
        .in('id', locationIds);
      extraById = new Map(
        (extraRows ?? []).map((row: Record<string, unknown>) => [
          String(row.id),
          {
            phone_number: typeof row.phone_number === 'string' ? row.phone_number : null,
            status:
              row.status === 'active' || row.status === 'inactive' ? row.status : null,
          },
        ]),
      );
    } catch {
      // Compatibility with older deployments where the new columns do not exist yet.
    }
  }

  const rowSnapshotByLocation = new Map<string, LocationSnapshotRow>();
  for (const snapshot of rowSnapshots) rowSnapshotByLocation.set(snapshot.location_id, snapshot);

  const gmvMtdByLocation = new Map<string, number>();
  const buyersByLocation = new Map<string, Set<string>>();
  for (const row of rowCurrentKpis) {
    const loc = row.location_id;
    if (!loc) continue;
    gmvMtdByLocation.set(loc, (gmvMtdByLocation.get(loc) ?? 0) + Number(row.gmv ?? 0));
  }
  for (const o of rowOrders) {
    const loc = o.location_id;
    if (!loc) continue;
    const set = buyersByLocation.get(loc) ?? new Set<string>();
    set.add(o.buyer_id);
    buyersByLocation.set(loc, set);
  }
  for (const estimate of rowEstimates) {
    const loc = estimate.location_id;
    if (!loc) continue;
    const set = buyersByLocation.get(loc) ?? new Set<string>();
    set.add(estimate.buyer_id);
    buyersByLocation.set(loc, set);
  }
  for (const invoice of rowInvoices) {
    const loc = invoice.location_id;
    if (!loc) continue;
    const set = buyersByLocation.get(loc) ?? new Set<string>();
    set.add(invoice.buyer_id);
    buyersByLocation.set(loc, set);
  }

  // Aggregate previous-period GMV by location
  const gmvPrevByLocation = new Map<string, number>();
  for (const row of rowPrevKpis) {
    const loc = row.location_id;
    if (!loc) continue;
    gmvPrevByLocation.set(loc, (gmvPrevByLocation.get(loc) ?? 0) + Number(row.gmv ?? 0));
  }

  const unfilteredRows: LocationsLandingRow[] = rowSeeds.map((loc) => {
    const snap = rowSnapshotByLocation.get(loc.id);
    const extra = extraById.get(loc.id);
    const gmv_mtd = gmvMtdByLocation.get(loc.id) ?? 0;
    const gmv_prev = gmvPrevByLocation.get(loc.id) ?? 0;
    const oos = Number(snap?.oos_sku_count ?? 0);
    const low = Number(snap?.low_stock_sku_count ?? 0);
    const stock_status: LocationStockStatus =
      oos > 0 ? 'out_of_stock' : low > 0 ? 'low_stock' : 'clear';
    const growth_pct =
      gmv_prev > 0 ? Math.round(((gmv_mtd - gmv_prev) / gmv_prev) * 100) : 0;

    return {
      id: loc.id,
      name: loc.name,
      city: getCity(loc.address),
      address_text: getAddressText(loc.address),
      phone_number: extra?.phone_number ?? null,
      initials: getInitials(loc.name),
      gmv_mtd,
      gmv_prev,
      growth_pct,
      active_buyers: buyersByLocation.get(loc.id)?.size ?? 0,
      outstanding_dues: Number(snap?.outstanding_dues ?? 0),
      sku_count: Number(snap?.sku_count ?? 0),
      oos_sku_count: oos,
      low_stock_sku_count: low,
      stock_status,
      oldest_unpaid_days: snap?.oldest_unpaid_days != null ? Number(snap.oldest_unpaid_days) : null,
      is_active: loc.deleted_at === null,
    };
  });

  const filteredRows = unfilteredRows.filter((row) => {
    const statusOk =
      !filters || filters.status.length === 0 ||
      filters.status.some((value) => {
        if (value === 'Active') return row.is_active;
        if (value === 'Inactive') return !row.is_active;
        return false;
      });
    const stockOk =
      !filters || filters.stock.length === 0 ||
      filters.stock.some((value) => {
        if (value === 'In Stock') return row.stock_status === 'clear';
        if (value === 'Low Stock') return row.stock_status === 'low_stock';
        if (value === 'Out of Stock') return row.stock_status === 'out_of_stock';
        return false;
      });
    const duesOk =
      !filters || filters.dues.length === 0 ||
      filters.dues.some((value) => {
        if (value === 'Due') return row.outstanding_dues > 0;
        if (value === 'Overdue') return row.outstanding_dues > 0 && (row.oldest_unpaid_days ?? 0) > 30;
        return false;
      });
    const searchOk =
      !filters || !filters.search || [row.name, row.city, row.address_text].some((value) => value.toLowerCase().includes(filters.search));
    return statusOk && stockOk && duesOk && searchOk;
  });

  const activeSummaryRows = [...summaryByLocation.values()]
    .filter((entry) => entry.seed.deleted_at === null)
    .map((entry) => {
      const snapshot = entry.snapshot;
      const oos = snapshot?.oos_sku_count ?? 0;
      const low = snapshot?.low_stock_sku_count ?? 0;
      return {
        id: entry.seed.id,
        name: entry.seed.name,
        city: getCity(entry.seed.address),
        initials: getInitials(entry.seed.name),
        gmv_mtd: entry.gmv_mtd,
        orders_count: entry.orders_count,
        outstanding_dues: snapshot?.outstanding_dues ?? 0,
        oldest_unpaid_days: snapshot?.oldest_unpaid_days ?? null,
        oos_sku_count: oos,
        low_stock_sku_count: low,
        stock_status: (oos > 0 ? 'out_of_stock' : low > 0 ? 'low_stock' : 'clear') as LocationStockStatus,
      };
    });

  const totalGmv = activeSummaryRows.reduce((sum, row) => sum + row.gmv_mtd, 0);
  const topLocation = activeSummaryRows.reduce<(typeof activeSummaryRows)[number] | null>(
    (best, row) => (best === null || row.gmv_mtd > best.gmv_mtd ? row : best),
    null,
  );

  // Unpaid invoices = sum of snapshot.invoice_count (outstanding invoices per location)
  const unpaid_invoice_count = (summarySnapshotRes.data ?? []).reduce(
    (sum: number, row: Record<string, unknown>) => sum + Number(row.invoice_count ?? 0),
    0,
  );
  const total_invoice_count = totalInvoiceCountRes.count ?? 0;

  // Estimate counts for current period
  const periodEstimates = (periodEstimatesRes.data ?? []) as Array<{ status: string }>;
  const TERMINAL_ESTIMATE_STATUSES = new Set(['cancelled', 'rejected', 'expired', 'invoiced']);
  const open_estimate_count = periodEstimates.filter((e) => !TERMINAL_ESTIMATE_STATUSES.has(e.status)).length;
  const total_estimate_count = periodEstimates.length;

  const kpis: LocationsLandingKpis = {
    unpaid_invoice_count,
    total_invoice_count,
    outstanding_dues_total: activeSummaryRows.reduce((sum, row) => sum + row.outstanding_dues, 0),
    dues_location_count: activeSummaryRows.filter((row) => row.outstanding_dues > 0).length,
    open_estimate_count,
    total_estimate_count,
    top_location_name: topLocation?.name ?? null,
    top_location_gmv_share_pct:
      topLocation && totalGmv > 0
        ? Math.round((topLocation.gmv_mtd / totalGmv) * 100)
        : 0,
  };

  // Callout: stock_critical — top 3 by oos+low desc
  const stock_critical: LocationsCalloutRow[] = [...activeSummaryRows]
    .filter((r) => r.stock_status !== 'clear')
    .sort((a, b) => b.oos_sku_count + b.low_stock_sku_count - (a.oos_sku_count + a.low_stock_sku_count))
    .slice(0, 3)
    .map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      initials: r.initials,
      critical_sku_count: r.oos_sku_count + r.low_stock_sku_count,
    }));

  const topLocationIds = [...activeSummaryRows]
    .filter((row) => row.orders_count > 0)
    .sort((a, b) => b.gmv_mtd - a.gmv_mtd)
    .slice(0, 2)
    .map((row) => row.id);

  const topLocationBuyerCounts = new Map<string, number>();
  if (topLocationIds.length > 0) {
    const buyerSets = new Map<string, Set<string>>();
    for (const row of [...rowOrders, ...rowEstimates, ...rowInvoices]) {
      const locationId = row.location_id;
      if (!locationId || !topLocationIds.includes(locationId)) continue;
      const set = buyerSets.get(locationId) ?? new Set<string>();
      set.add(row.buyer_id);
      buyerSets.set(locationId, set);
    }
    for (const [locationId, buyers] of buyerSets.entries()) {
      topLocationBuyerCounts.set(locationId, buyers.size);
    }
  }

  const top_locations: LocationsCalloutRow[] = activeSummaryRows
    .filter((row) => topLocationIds.includes(row.id))
    .sort((a, b) => b.gmv_mtd - a.gmv_mtd)
    .map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      initials: row.initials,
      gmv_mtd: row.gmv_mtd,
      orders_count: row.orders_count,
      buyers_count: topLocationBuyerCounts.get(row.id) ?? 0,
    }));

  const collections_overdue: LocationsCalloutRow[] = [...activeSummaryRows]
    .filter((r) => r.outstanding_dues > 0 && (r.oldest_unpaid_days ?? 0) > 30)
    .sort((a, b) => b.outstanding_dues - a.outstanding_dues)
    .slice(0, 3)
    .map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      initials: r.initials,
      outstanding_dues: r.outstanding_dues,
      oldest_unpaid_days: r.oldest_unpaid_days ?? 0,
    }));

  return {
    kpis,
    callouts: { stock_critical, top_locations, collections_overdue },
    locations: filteredRows,
    period: SELLER_LANDING_PERIOD_OPTIONS.find((o) => o.value === period.selected)?.label ?? period.selected,
    refreshed_at: new Date().toISOString(),
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

  try {
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusFilter = readArrayParam(request.nextUrl.searchParams, 'status');
    const stockFilter = readArrayParam(request.nextUrl.searchParams, 'stock');
    const duesFilter = readArrayParam(request.nextUrl.searchParams, 'dues');
    const db = supabaseAdmin;
    const payload = await getLocationsLandingPayload(
      db as any,
      claims.tenant_id!,
      request.nextUrl.searchParams.get('period'),
      {
        search,
        status: statusFilter,
        stock: stockFilter,
        dues: duesFilter,
      },
    );
    return timedJson(payload);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[GET /api/tenant/locations/landing]', err?.code, err?.message);
    return timedJson({ error: 'Failed to fetch locations landing' }, { status: 500 });
  }
}
