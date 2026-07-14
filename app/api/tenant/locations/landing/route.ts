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
    const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const offset = parseRowsOffset(request.nextUrl.searchParams.get('offset'));
    const includeSummary = request.nextUrl.searchParams.get('include_summary') !== 'false';
    const today = new Date();
    const expiryEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const summaryPromise = includeSummary
      ? db.schema('app').rpc('get_seller_locations_landing_summary', {
          p_tenant_id: tenantId,
          p_location_ids: null,
          p_current_start: period.current_start.split('T')[0],
          p_current_end_exclusive: period.current_end_exclusive.split('T')[0],
          p_today: today.toISOString().split('T')[0],
          p_expiry_end: expiryEnd.toISOString().split('T')[0],
        })
      : Promise.resolve({ data: null, error: null });

    const [rowIdsRes, summaryRes] = await Promise.all([
      db.schema('app').rpc('search_seller_location_landing_ids', {
        p_tenant_id: tenantId,
        p_query: request.nextUrl.searchParams.get('search')?.trim().toLowerCase() || null,
        p_statuses: readArrayParam(request.nextUrl.searchParams, 'status') || null,
        p_stock_modes: readArrayParam(request.nextUrl.searchParams, 'stock') || null,
        p_dues_modes: readArrayParam(request.nextUrl.searchParams, 'dues') || null,
        p_location_ids: null,
        p_limit: limit,
        p_offset: offset,
      }),
      summaryPromise,
    ]);
    if (rowIdsRes.error || summaryRes.error) throw rowIdsRes.error ?? summaryRes.error;

    const idRows = (rowIdsRes.data ?? []) as Array<{ id: string | null; total_count: number | string }>;
    const rowIds = idRows.flatMap((row) => (row.id ? [row.id] : []));
    const rowsPromise = rowIds.length > 0
      ? db.schema('app').from('locations')
          .select('id, name, address, phone_number, status')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .in('id', rowIds)
          .limit(limit)
      : Promise.resolve({ data: [], error: null });
    const metricsPromise = rowIds.length > 0
      ? db.schema('app').rpc('get_seller_location_landing_row_metrics', {
          p_tenant_id: tenantId,
          p_location_ids: rowIds,
          p_current_start: period.current_start.split('T')[0],
          p_current_end_exclusive: period.current_end_exclusive.split('T')[0],
          p_previous_start: period.previous_start.split('T')[0],
          p_previous_end_exclusive: period.previous_end_exclusive.split('T')[0],
        })
      : Promise.resolve({ data: [], error: null });

    const [rowsRes, metricsRes] = await Promise.all([rowsPromise, metricsPromise]);
    if (rowsRes.error || metricsRes.error) throw rowsRes.error ?? metricsRes.error;

    const seedsById = new Map(
      ((rowsRes.data ?? []) as LocationSeedRow[]).map((row) => [row.id, row]),
    );
    const metricsById = new Map(
      ((metricsRes.data ?? []) as LocationRowMetric[]).map((row) => [row.location_id, row]),
    );
    const locations: LocationsLandingRow[] = rowIds.flatMap((id) => {
      const seed = seedsById.get(id);
      if (!seed) return [];
      const metric = metricsById.get(id);
      const gmvCurrent = Number(metric?.gmv_current ?? 0);
      const gmvPrevious = Number(metric?.gmv_previous ?? 0);
      const outOfStock = Number(metric?.oos_sku_count ?? 0);
      const lowStock = Number(metric?.low_stock_sku_count ?? 0);
      const stockStatus: LocationStockStatus = outOfStock > 0
        ? 'out_of_stock'
        : lowStock > 0 ? 'low_stock' : 'clear';

      return [{
        id: seed.id,
        name: seed.name,
        city: getCity(seed.address),
        address_text: getAddressText(seed.address),
        phone_number: seed.phone_number ?? null,
        initials: getInitials(seed.name),
        gmv_mtd: gmvCurrent,
        gmv_prev: gmvPrevious,
        growth_pct: gmvPrevious > 0 ? Math.round(((gmvCurrent - gmvPrevious) / gmvPrevious) * 100) : 0,
        active_buyers: Number(metric?.active_buyers ?? 0),
        outstanding_dues: Number(metric?.outstanding_dues ?? 0),
        sku_count: Number(metric?.sku_count ?? 0),
        oos_sku_count: outOfStock,
        low_stock_sku_count: lowStock,
        stock_status: stockStatus,
        oldest_unpaid_days: metric?.oldest_unpaid_days == null ? null : Number(metric.oldest_unpaid_days),
        is_active: seed.status !== 'inactive',
      }];
    });

    const total = Number(idRows[0]?.total_count ?? 0);
    const summary = includeSummary ? normalizeSummary(summaryRes.data) : EMPTY_SUMMARY;
    const response: LocationsLandingResponse = {
      ...summary,
      locations,
      total,
      limit,
      offset,
      nextOffset: rowIds.length > 0 && offset + rowIds.length < total ? offset + rowIds.length : null,
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
