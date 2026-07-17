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
  gmv_previous: number | string | null;
  active_buyers: number | string | null;
}

type LocationsSummary = Pick<LocationsLandingResponse, 'kpis' | 'callouts'>;

const EMPTY_KPIS: LocationsLandingKpis = {
  active_locations: 0,
  unpaid_invoice_count: 0,
  total_invoice_count: 0,
  outstanding_dues_total: 0,
  dues_location_count: 0,
  open_estimate_count: 0,
  total_estimate_count: 0,
  top_location_name: null,
  top_location_gmv_share_pct: 0,
};

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

function matchesLocationStockFilter(filters: string[], stockStatus: LocationStockStatus) {
  if (filters.length === 0) return true;
  return (
    (filters.includes('In Stock') && stockStatus === 'clear')
    || (filters.includes('Low Stock') && stockStatus === 'low_stock')
    || (filters.includes('Out of Stock') && stockStatus === 'out_of_stock')
  );
}

function matchesDuesFilter(filters: string[], outstanding: number, oldestUnpaidDays: number | null) {
  if (filters.length === 0) return true;
  return (
    (filters.includes('Due') && outstanding > 0)
    || (filters.includes('Overdue') && outstanding > 0 && (oldestUnpaidDays ?? 0) > 30)
  );
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
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const offset = parseRowsOffset(request.nextUrl.searchParams.get('offset'));
    const includeSummary = request.nextUrl.searchParams.get('include_summary') !== 'false';
    const today = new Date();
    const expiryEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() || '';
    const statusFilters = readArrayParam(request.nextUrl.searchParams, 'status') || [];
    const stockFilters = readArrayParam(request.nextUrl.searchParams, 'stock') || [];
    const duesFilters = readArrayParam(request.nextUrl.searchParams, 'dues') || [];
    const [rowsRes, snapshotRes, dailyRes, invoicesRes, estimatesRes] = await Promise.all([
      db.schema('app').from('locations')
        .select('id, name, address, phone_number, status')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db.schema('app').from('metrics_location_snapshot')
        .select('location_id, stocked_product_count, low_stock_product_count, out_of_stock_product_count, receivable_amount, overdue_amount')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db.schema('app').from('metrics_location_daily')
        .select('location_id, day, invoice_value')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('day', period.previous_start.split('T')[0])
        .lt('day', period.current_end_exclusive.split('T')[0]),
      db.schema('app').from('invoices')
        .select('id, location_id, buyer_id, due_date, outstanding_balance, invoice_date, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db.schema('app').from('estimates')
        .select('id, location_id, buyer_id, estimate_number, total_amount, expires_at, status')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
    ]);
    const firstError = rowsRes.error ?? snapshotRes.error ?? dailyRes.error ?? invoicesRes.error ?? estimatesRes.error;
    if (firstError) throw firstError;

    const seeds = (rowsRes.data ?? []) as LocationSeedRow[];
    const snapshotsById = new Map(
      ((snapshotRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.location_id), row]),
    );
    const dailyRows = (dailyRes.data ?? []) as Array<Record<string, unknown>>;
    const invoices = (invoicesRes.data ?? []) as Array<Record<string, unknown>>;
    const estimates = (estimatesRes.data ?? []) as Array<Record<string, unknown>>;

    const gmvsByLocation = new Map<string, { current: number; previous: number }>();
    for (const row of dailyRows) {
      const locationId = String(row.location_id);
      const bucket = gmvsByLocation.get(locationId) ?? { current: 0, previous: 0 };
      const day = String(row.day);
      const value = Number(row.invoice_value ?? 0);
      if (day >= period.current_start.split('T')[0] && day < period.current_end_exclusive.split('T')[0]) bucket.current += value;
      if (day >= period.previous_start.split('T')[0] && day < period.previous_end_exclusive.split('T')[0]) bucket.previous += value;
      gmvsByLocation.set(locationId, bucket);
    }
    const invoiceStatsByLocation = new Map<string, { outstanding: number; oldestUnpaidDays: number | null; unpaidInvoiceCount: number; totalInvoiceCount: number; activeBuyers: Set<string> }>();
    for (const invoice of invoices) {
      const locationId = String(invoice.location_id ?? '');
      if (!locationId) continue;
      const bucket = invoiceStatsByLocation.get(locationId) ?? { outstanding: 0, oldestUnpaidDays: null, unpaidInvoiceCount: 0, totalInvoiceCount: 0, activeBuyers: new Set<string>() };
      bucket.totalInvoiceCount += 1;
      if (invoice.buyer_id) bucket.activeBuyers.add(String(invoice.buyer_id));
      const outstanding = Number(invoice.outstanding_balance ?? 0);
      if (outstanding > 0) {
        bucket.outstanding += outstanding;
        bucket.unpaidInvoiceCount += 1;
        const dueDate = invoice.due_date ? new Date(String(invoice.due_date)) : null;
        if (dueDate && Number.isFinite(dueDate.getTime())) {
          const age = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
          bucket.oldestUnpaidDays = bucket.oldestUnpaidDays == null ? age : Math.max(bucket.oldestUnpaidDays, age);
        }
      }
      invoiceStatsByLocation.set(locationId, bucket);
    }

    const allLocations: LocationsLandingRow[] = seeds.map((seed) => {
      const snapshot = snapshotsById.get(seed.id);
      const gmv = gmvsByLocation.get(seed.id) ?? { current: 0, previous: 0 };
      const invoiceStats = invoiceStatsByLocation.get(seed.id) ?? { outstanding: 0, oldestUnpaidDays: null, unpaidInvoiceCount: 0, totalInvoiceCount: 0, activeBuyers: new Set<string>() };
      const outOfStock = Number(snapshot?.out_of_stock_product_count ?? 0);
      const lowStock = Number(snapshot?.low_stock_product_count ?? 0);
      const stockStatus: LocationStockStatus = outOfStock > 0 ? 'out_of_stock' : lowStock > 0 ? 'low_stock' : 'clear';
      return {
        id: seed.id,
        name: seed.name,
        city: getCity(seed.address),
        address_text: getAddressText(seed.address),
        phone_number: seed.phone_number ?? null,
        initials: getInitials(seed.name),
        gmv_mtd: gmv.current,
        gmv_prev: gmv.previous,
        growth_pct: gmv.previous > 0 ? Math.round(((gmv.current - gmv.previous) / gmv.previous) * 100) : 0,
        active_buyers: invoiceStats.activeBuyers.size,
        outstanding_dues: Number(snapshot?.receivable_amount ?? invoiceStats.outstanding),
        sku_count: Number(snapshot?.stocked_product_count ?? 0),
        oos_sku_count: outOfStock,
        low_stock_sku_count: lowStock,
        stock_status: stockStatus,
        oldest_unpaid_days: invoiceStats.oldestUnpaidDays,
        is_active: seed.status !== 'inactive',
      };
    }).filter((row) => {
      if (search) {
        const haystack = [row.name, row.city, row.address_text, row.phone_number].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (statusFilters.length > 0) {
        const label = row.is_active ? 'active' : 'inactive';
        if (!statusFilters.includes(label)) return false;
      }
      if (!matchesLocationStockFilter(stockFilters, row.stock_status)) return false;
      if (!matchesDuesFilter(duesFilters, row.outstanding_dues, row.oldest_unpaid_days)) return false;
      return true;
    });

    const total = allLocations.length;
    const locations = allLocations.slice(offset, offset + limit);
    const topLocation = [...allLocations].sort((a, b) => b.gmv_mtd - a.gmv_mtd)[0] ?? null;
    const totalGmv = allLocations.reduce((sum, row) => sum + row.gmv_mtd, 0);
    const openEstimates = estimates.filter((row) => {
      const status = String(row.status ?? '');
      return status !== 'converted' && status !== 'void' && status !== 'rejected' && status !== 'expired';
    });
    const summary: LocationsSummary = includeSummary ? {
      kpis: {
        active_locations: allLocations.filter((row) => row.is_active).length,
        unpaid_invoice_count: Array.from(invoiceStatsByLocation.values()).reduce((sum, row) => sum + row.unpaidInvoiceCount, 0),
        total_invoice_count: Array.from(invoiceStatsByLocation.values()).reduce((sum, row) => sum + row.totalInvoiceCount, 0),
        outstanding_dues_total: allLocations.reduce((sum, row) => sum + row.outstanding_dues, 0),
        dues_location_count: allLocations.filter((row) => row.outstanding_dues > 0).length,
        open_estimate_count: openEstimates.length,
        total_estimate_count: estimates.length,
        top_location_name: topLocation?.name ?? null,
        top_location_gmv_share_pct: totalGmv > 0 && topLocation ? Math.round((topLocation.gmv_mtd / totalGmv) * 100) : 0,
      },
      callouts: {
        conversions: openEstimates
          .filter((row) => row.expires_at && new Date(String(row.expires_at)).getTime() <= expiryEnd.getTime())
          .sort((a, b) => new Date(String(a.expires_at ?? '')).getTime() - new Date(String(b.expires_at ?? '')).getTime())
          .slice(0, 3)
          .map((row) => ({
            id: String(row.id),
            name: String(row.estimate_number ?? 'Estimate'),
            city: '',
            initials: getInitials(String(row.estimate_number ?? 'Estimate')),
            estimate_number: String(row.estimate_number ?? 'Estimate'),
            expires_in_days: row.expires_at
              ? Math.max(0, Math.floor((new Date(String(row.expires_at)).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
              : 0,
            total_amount: Number(row.total_amount ?? 0),
          })),
        top_locations: [...allLocations]
          .sort((a, b) => b.gmv_mtd - a.gmv_mtd)
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            name: row.name,
            city: row.city,
            initials: row.initials,
            gmv_mtd: row.gmv_mtd,
            orders_count: 0,
            buyers_count: row.active_buyers,
          })),
        collections_overdue: [...allLocations]
          .filter((row) => row.outstanding_dues > 0 && (row.oldest_unpaid_days ?? 0) > 30)
          .sort((a, b) => b.outstanding_dues - a.outstanding_dues)
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            name: row.name,
            city: row.city,
            initials: row.initials,
            outstanding_dues: row.outstanding_dues,
            oldest_unpaid_days: row.oldest_unpaid_days ?? 0,
          })),
      },
    } : EMPTY_SUMMARY;
    const response: LocationsLandingResponse = {
      ...summary,
      locations,
      total,
      limit,
      offset,
      nextOffset: locations.length > 0 && offset + locations.length < total ? offset + locations.length : null,
      period: SELLER_LANDING_PERIOD_OPTIONS.find((option) => option.value === period.selected)?.label ?? period.selected,
      refreshed_at: new Date().toISOString(),
    };
    return timedJson(response);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[GET /api/tenant/locations/landing]', err?.code, err?.message);
    return timedJson({ error: 'Failed to fetch locations landing' }, { status: 500 });
  }
}
