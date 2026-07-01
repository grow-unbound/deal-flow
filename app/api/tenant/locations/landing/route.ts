import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
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
  tenantId: string,
  periodInput?: string | null,
): Promise<LocationsLandingResponse> {
  const db = supabaseAdmin as any;
  const period = getSellerLandingPeriodMeta(periodInput);

  const [locationsRes, snapshotRes, currentOrdersRes, prevOrdersRes, currentEstimatesRes, currentInvoicesRes] = await Promise.all([
    db
      .schema('app')
      .from('locations')
      .select('id, name, type, address, deleted_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),

    db
      .schema('app')
      .from('locations_snapshot')
      .select('location_id, sku_count, oos_sku_count, low_stock_sku_count, outstanding_dues, oldest_unpaid_days, invoice_count')
      .eq('tenant_id', tenantId),

    db
      .schema('app')
      .from('orders')
      .select('id, location_id, buyer_id, total_amount')
      .eq('tenant_id', tenantId)
      .not('status', 'in', '("cancelled","draft")')
      .is('deleted_at', null)
      .gte('placed_at', period.current_start)
      .lt('placed_at', period.current_end_exclusive),

    db
      .schema('app')
      .from('orders')
      .select('id, location_id, total_amount')
      .eq('tenant_id', tenantId)
      .not('status', 'in', '("cancelled","draft")')
      .is('deleted_at', null)
      .gte('placed_at', period.previous_start)
      .lt('placed_at', period.previous_end_exclusive),
    db
      .schema('app')
      .from('estimates')
      .select('id, location_id, buyer_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('issued_at', period.current_start)
      .lt('issued_at', period.current_end_exclusive),
    db
      .schema('app')
      .from('invoices')
      .select('id, location_id, buyer_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('issued_at', period.current_start)
      .lt('issued_at', period.current_end_exclusive),
  ]);

  if (locationsRes.error) throw locationsRes.error;
  if (currentOrdersRes.error || prevOrdersRes.error || currentEstimatesRes.error || currentInvoicesRes.error) {
    throw currentOrdersRes.error ?? prevOrdersRes.error ?? currentEstimatesRes.error ?? currentInvoicesRes.error;
  }

  const rawLocations:
    Array<{ id: string; name: string; type: string; address: unknown; deleted_at: string | null }> =
    locationsRes.data ?? [];
  const snapshots: Array<Record<string, unknown>> = snapshotRes.data ?? [];
  const currentOrders: Array<{ id: string; location_id: string | null; buyer_id: string; total_amount: number }> =
    currentOrdersRes.data ?? [];
  const prevOrders: Array<{ id: string; location_id: string | null; total_amount: number }> =
    prevOrdersRes.data ?? [];
  const currentEstimates: Array<{ id: string; location_id: string | null; buyer_id: string }> = currentEstimatesRes.data ?? [];
  const currentInvoices: Array<{ id: string; location_id: string | null; buyer_id: string }> = currentInvoicesRes.data ?? [];

  const locationIds = rawLocations.map((loc) => loc.id);
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

  // Index snapshots by location_id
  const snapshotByLocation = new Map<string, Record<string, unknown>>();
  for (const s of snapshots) snapshotByLocation.set(s.location_id as string, s);

  // Aggregate current-period GMV + buyers by location
  const gmvMtdByLocation = new Map<string, number>();
  const buyersByLocation = new Map<string, Set<string>>();
  const orderCountByLocation = new Map<string, number>();
  for (const o of currentOrders) {
    const loc = o.location_id;
    if (!loc) continue;
    gmvMtdByLocation.set(loc, (gmvMtdByLocation.get(loc) ?? 0) + Number(o.total_amount ?? 0));
    orderCountByLocation.set(loc, (orderCountByLocation.get(loc) ?? 0) + 1);
    const set = buyersByLocation.get(loc) ?? new Set<string>();
    set.add(o.buyer_id);
    buyersByLocation.set(loc, set);
  }
  for (const estimate of currentEstimates) {
    const loc = estimate.location_id;
    if (!loc) continue;
    const set = buyersByLocation.get(loc) ?? new Set<string>();
    set.add(estimate.buyer_id);
    buyersByLocation.set(loc, set);
  }
  for (const invoice of currentInvoices) {
    const loc = invoice.location_id;
    if (!loc) continue;
    const set = buyersByLocation.get(loc) ?? new Set<string>();
    set.add(invoice.buyer_id);
    buyersByLocation.set(loc, set);
  }

  // Aggregate previous-period GMV by location
  const gmvPrevByLocation = new Map<string, number>();
  for (const o of prevOrders) {
    const loc = o.location_id;
    if (!loc) continue;
    gmvPrevByLocation.set(loc, (gmvPrevByLocation.get(loc) ?? 0) + Number(o.total_amount ?? 0));
  }

  // Build rows
  const rows: LocationsLandingRow[] = rawLocations.map((loc) => {
    const snap = snapshotByLocation.get(loc.id);
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
      type: loc.type,
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

  const activeRows = rows.filter((r) => r.is_active);
  const totalGmv = activeRows.reduce((s, r) => s + r.gmv_mtd, 0);

  const topLocation = activeRows.reduce<LocationsLandingRow | null>(
    (best, r) => (best === null || r.gmv_mtd > best.gmv_mtd ? r : best),
    null,
  );

  const kpis: LocationsLandingKpis = {
    active_locations: activeRows.length,
    total_locations: rows.length,
    outstanding_dues_total: activeRows.reduce((s, r) => s + r.outstanding_dues, 0),
    dues_location_count: activeRows.filter((r) => r.outstanding_dues > 0).length,
    low_stock_locations: activeRows.filter((r) => r.stock_status !== 'clear').length,
    top_location_name: topLocation?.name ?? null,
    top_location_gmv_share_pct:
      topLocation && totalGmv > 0
        ? Math.round((topLocation.gmv_mtd / totalGmv) * 100)
        : 0,
  };

  // Callout: stock_critical — top 3 by oos+low desc
  const stock_critical: LocationsCalloutRow[] = [...activeRows]
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

  // Callout: top_locations — top 2 by GMV with at least 1 order
  const top_locations: LocationsCalloutRow[] = [...activeRows]
    .filter((r) => (orderCountByLocation.get(r.id) ?? 0) > 0)
    .sort((a, b) => b.gmv_mtd - a.gmv_mtd)
    .slice(0, 2)
    .map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      initials: r.initials,
      gmv_mtd: r.gmv_mtd,
      orders_count: orderCountByLocation.get(r.id) ?? 0,
      buyers_count: buyersByLocation.get(r.id)?.size ?? 0,
    }));

  // Callout: collections_overdue — top 3 with oldest_unpaid_days > 30
  const collections_overdue: LocationsCalloutRow[] = [...activeRows]
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
    locations: rows,
    period: SELLER_LANDING_PERIOD_OPTIONS.find((o) => o.value === period.selected)?.label ?? period.selected,
    refreshed_at: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('locations_landing'));
    return response;
  };

  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return timedJson({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
  if (!flagEnabled) return timedJson({ error: 'Feature not enabled' }, { status: 403 });

  try {
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusFilter = readArrayParam(request.nextUrl.searchParams, 'status');
    const stockFilter = readArrayParam(request.nextUrl.searchParams, 'stock');
    const duesFilter = readArrayParam(request.nextUrl.searchParams, 'dues');
    const payload = await getLocationsLandingPayload(
      claims.tenant_id,
      request.nextUrl.searchParams.get('period'),
    );
    const filteredLocations = payload.locations.filter((row) => {
      const statusOk =
        statusFilter.length === 0 ||
        statusFilter.some((value) => {
          if (value === 'Active') return row.is_active;
          if (value === 'Inactive') return !row.is_active;
          return false;
        });
      const stockOk =
        stockFilter.length === 0 ||
        stockFilter.some((value) => {
          if (value === 'In Stock') return row.stock_status === 'clear';
          if (value === 'Low Stock') return row.stock_status === 'low_stock';
          if (value === 'Out of Stock') return row.stock_status === 'out_of_stock';
          return false;
        });
      const duesOk =
        duesFilter.length === 0 ||
        duesFilter.some((value) => {
          if (value === 'Due') return row.outstanding_dues > 0;
          if (value === 'Overdue') return row.outstanding_dues > 0 && (row.oldest_unpaid_days ?? 0) > 30;
          return false;
        });
      const searchOk = !search || [row.name, row.type, row.city, row.address_text].some((value) => value.toLowerCase().includes(search));
      return statusOk && stockOk && duesOk && searchOk;
    });
    return timedJson({ ...payload, locations: filteredLocations });
  } catch (error: any) {
    console.error('[GET /api/tenant/locations/landing]', error?.code, error?.message);
    return timedJson({ error: 'Failed to fetch locations landing' }, { status: 500 });
  }
}
