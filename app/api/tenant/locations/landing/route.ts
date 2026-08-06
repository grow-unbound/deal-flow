import { NextRequest } from 'next/server';

import type {
  LocationsLandingResponse,
  LocationsLandingRow,
  LocationStockStatus,
} from '@/hooks/useLocations';
import { getVerifiedClaims } from '@/lib/auth';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type DbClient = {
  schema: (name: string) => {
    from: (table: string) => any;
  };
};

type SortKey = 'invoice_value' | 'open_demand_value' | 'overdue_amount';

type CursorPayload = {
  v: number;
  i: string;
  n?: number;
  e?: number;
};

type PeriodRow = {
  location_id: string;
  invoice_count: number | string | null;
  invoice_value: number | string | null;
  invoice_buyer_count: number | string | null;
  estimate_count: number | string | null;
  estimate_value: number | string | null;
  order_count: number | string | null;
  order_value: number | string | null;
  primary_demand_kind: 'orders' | 'estimates' | 'none' | string | null;
  primary_demand_count: number | string | null;
  primary_demand_value: number | string | null;
  primary_demand_buyer_count: number | string | null;
};

type NowRow = {
  location_id: string;
  open_estimate_count: number | string | null;
  open_order_count: number | string | null;
  overdue_amount: number | string | null;
};

type LocationIdentity = {
  id: string;
  name: string;
  address: unknown;
  phone_number?: string | null;
  status?: 'active' | 'inactive' | null;
};

type LocationStatusFilter = 'active' | 'dormant' | 'inactive';
type LocationAttentionFilter = 'overdue' | 'open_demand' | 'top80';

const LOCATION_SCAN_LIMIT = 1000;
const LOCATION_FILTERS = {
  groups: [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'dormant', label: 'Dormant' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
    {
      key: 'attention',
      label: 'Attention',
      options: [
        { value: 'open_demand', label: 'Open demand' },
        { value: 'overdue', label: 'Overdue' },
        { value: 'top80', label: 'Top 80%' },
      ],
    },
  ],
};

const EMPTY_RESPONSE: LocationsLandingResponse = {
  locations: [],
  total: null,
  limit: PAGE_SIZE.SELLER,
  nextCursor: null,
  sort: 'invoice_value',
  period_key: 'this_month',
  grain: 'month',
  period_start: '',
  refreshed_at: '',
  as_of: '',
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Partial<CursorPayload>;
    if (typeof parsed.v !== 'number' || typeof parsed.i !== 'string') return null;
    return {
      v: parsed.v,
      i: parsed.i,
      n: typeof parsed.n === 'number' ? parsed.n : undefined,
      e: typeof parsed.e === 'number' ? parsed.e : undefined,
    };
  } catch {
    return null;
  }
}

function parseSort(value: string | null): SortKey {
  if (value === 'open_demand_value' || value === 'overdue_amount') return value;
  return 'invoice_value';
}

function parseFilterPreset(raw: string | null): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeLocationStatuses(values: string[]): LocationStatusFilter[] {
  const allowed = new Set<LocationStatusFilter>(['active', 'dormant', 'inactive']);
  return values.filter((value): value is LocationStatusFilter => allowed.has(value as LocationStatusFilter));
}

function normalizeLocationAttention(values: string[]): LocationAttentionFilter[] {
  const allowed = new Set<LocationAttentionFilter>(['overdue', 'open_demand', 'top80']);
  return values.filter((value): value is LocationAttentionFilter => allowed.has(value as LocationAttentionFilter));
}

function statusesFromPreset(preset: Record<string, unknown> | null): LocationStatusFilter[] {
  if (!preset) return [];
  if (typeof preset.sold_period === 'string') return ['active'];
  if (typeof preset.not_sold_period === 'string') return ['dormant'];
  if (preset.sold_previous_period === true && preset.sold_current_period === false) return ['dormant'];
  return [];
}

function attentionFromPreset(preset: Record<string, unknown> | null): LocationAttentionFilter[] {
  if (!preset) return [];
  if (preset.overdue === true) return ['overdue'];
  if (preset.open_demand === true) return ['open_demand'];
  if (preset.cutoff === 'top80') return ['top80'];
  return [];
}

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

function sortValue(row: PeriodRow, now: NowRow | undefined, sort: SortKey): number {
  if (sort === 'open_demand_value') {
    return toNumber(now?.open_order_count);
  }
  if (sort === 'overdue_amount') return toNumber(now?.overdue_amount);
  return toNumber(row.invoice_value);
}

function compareLocations(left: LocationsLandingRow, right: LocationsLandingRow, sort: SortKey): number {
  const leftValue = sort === 'overdue_amount'
    ? left.overdue_amount
    : sort === 'open_demand_value'
      ? left.primary_demand_value
      : left.gmv_mtd;
  const rightValue = sort === 'overdue_amount'
    ? right.overdue_amount
    : sort === 'open_demand_value'
      ? right.primary_demand_value
      : right.gmv_mtd;
  if (leftValue !== rightValue) return rightValue - leftValue;
  return left.id.localeCompare(right.id);
}

function applyLocationCursor(rows: LocationsLandingRow[], sort: SortKey, cursor: CursorPayload | null) {
  if (!cursor) return rows;
  return rows.filter((row) => {
    const value = sort === 'overdue_amount'
      ? row.overdue_amount
      : sort === 'open_demand_value'
        ? row.primary_demand_value
        : row.gmv_mtd;
    return value < cursor.v || (value === cursor.v && row.id > cursor.i);
  });
}

function locationMatchesStatus(row: LocationsLandingRow, statuses: LocationStatusFilter[]): boolean {
  if (statuses.length === 0) return true;
  const sold = row.gmv_mtd > 0 || row.invoice_count_90d > 0;
  return statuses.some((status) => {
    if (status === 'active') return row.is_active && sold;
    if (status === 'dormant') return row.is_active && !sold;
    return !row.is_active;
  });
}

function locationMatchesAttention(row: LocationsLandingRow, attention: LocationAttentionFilter[]): boolean {
  if (attention.length === 0) return true;
  return attention.some((value) => {
    if (value === 'overdue') return row.overdue_amount > 0;
    if (value === 'open_demand') return row.open_demand_count > 0;
    return row.gmv_mtd > 0;
  });
}

function applyKeyset(query: any, sort: SortKey, cursor: CursorPayload | null) {
  if (!cursor) return query;
  if (sort === 'invoice_value') {
    return query.or(`invoice_value.lt.${cursor.v},and(invoice_value.eq.${cursor.v},location_id.gt.${cursor.i})`);
  }
  if (sort === 'open_demand_value') {
    return query.or(
      `primary_demand_value.lt.${cursor.v},and(primary_demand_value.eq.${cursor.v},location_id.gt.${cursor.i})`,
    );
  }
  return query;
}

function applyNowKeyset(query: any, sort: SortKey, cursor: CursorPayload | null) {
  if (!cursor) return query;
  if (sort === 'overdue_amount') {
    return query.or(`overdue_amount.lt.${cursor.v},and(overdue_amount.eq.${cursor.v},location_id.gt.${cursor.i})`);
  }
  if (sort === 'open_demand_value') {
    const estimateCount = cursor.e ?? 0;
    return query.or(
      `open_order_count.lt.${cursor.v},and(open_order_count.eq.${cursor.v},open_estimate_count.lt.${estimateCount}),and(open_order_count.eq.${cursor.v},open_estimate_count.eq.${estimateCount},location_id.gt.${cursor.i})`,
    );
  }
  return query.or(`location_id.gt.${cursor.i}`);
}

async function resolveLocationIdsBySearch(db: DbClient, tenantId: string, search: string | null): Promise<string[] | null> {
  if (!search) return null;
  const normalized = search.replace(/[*(),]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const likeValue = `%${normalized}%`;
  const { data, error } = await db
    .schema('app')
    .from('locations')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .or(`name.ilike.${likeValue},phone_number.ilike.${likeValue}`)
    .limit(500);
  if (error) throw new Error(error.message ?? 'Failed to search locations');
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function fetchLocationUniverseIds(db: DbClient, tenantId: string, searchIds: string[] | null): Promise<string[]> {
  let query = db
    .schema('app')
    .from('locations')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(LOCATION_SCAN_LIMIT);
  if (searchIds) query = query.in('id', searchIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Failed to load locations');
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function fetchLocationIdentities(
  db: DbClient,
  tenantId: string,
  locationIds: string[],
): Promise<Map<string, LocationIdentity>> {
  const map = new Map<string, LocationIdentity>();
  if (locationIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('locations')
    .select('id, name, address, phone_number, status')
    .eq('tenant_id', tenantId)
    .in('id', locationIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message ?? 'Failed to load locations');
  for (const row of (data ?? []) as LocationIdentity[]) {
    map.set(row.id, row);
  }
  return map;
}

async function fetchNowRows(
  db: DbClient,
  tenantId: string,
  locationIds: string[],
): Promise<Map<string, NowRow>> {
  const map = new Map<string, NowRow>();
  if (locationIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_location_now_summary')
    .select('location_id, open_estimate_count, open_order_count, overdue_amount')
    .eq('tenant_id', tenantId)
    .in('location_id', locationIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message ?? 'Failed to load location now summaries');
  for (const row of (data ?? []) as NowRow[]) map.set(row.location_id, row);
  return map;
}

async function fetchPeriodRowsByIds(
  db: DbClient,
  tenantId: string,
  periodStart: string,
  locationIds: string[],
): Promise<Map<string, PeriodRow>> {
  const map = new Map<string, PeriodRow>();
  if (locationIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_location_period_summary')
    .select(
      'location_id, invoice_count, invoice_value, invoice_buyer_count, estimate_count, estimate_value, order_count, order_value, primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count',
    )
    .eq('tenant_id', tenantId)
    .eq('grain', 'month')
    .eq('period_start', periodStart)
    .in('location_id', locationIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message ?? 'Failed to load location period summaries');
  for (const row of (data ?? []) as PeriodRow[]) map.set(row.location_id, row);
  return map;
}

async function fetchTop80Count(db: DbClient, tenantId: string, periodStart: string): Promise<number> {
  const { data, error } = await db
    .schema('app')
    .from('metrics_tenant_top80_cache')
    .select('top80_count')
    .eq('tenant_id', tenantId)
    .eq('entity_kind', 'locations')
    .eq('grain', 'month')
    .eq('period_start', periodStart)
    .limit(1);
  if (error) throw new Error(error.message ?? 'Failed to load locations top80 count');
  return toNumber(((data ?? []) as Array<{ top80_count: number | string | null }>)[0]?.top80_count);
}

function emptyPeriodRow(locationId: string): PeriodRow {
  return {
    location_id: locationId,
    invoice_count: 0,
    invoice_value: 0,
    invoice_buyer_count: 0,
    estimate_count: 0,
    estimate_value: 0,
    order_count: 0,
    order_value: 0,
    primary_demand_kind: 'none',
    primary_demand_count: 0,
    primary_demand_value: 0,
    primary_demand_buyer_count: 0,
  };
}

function mergeLocationRow(identity: LocationIdentity, period: PeriodRow, now: NowRow | undefined): LocationsLandingRow {
  const openEstimateCount = toNumber(now?.open_estimate_count);
  const openOrderCount = toNumber(now?.open_order_count);
  const stockStatus: LocationStockStatus = 'clear';
  return {
    id: identity.id,
    name: identity.name,
    city: getCity(identity.address),
    address_text: getAddressText(identity.address),
    phone_number: identity.phone_number ?? null,
    initials: getInitials(identity.name),
    gmv_mtd: toNumber(period.invoice_value),
    active_buyers: toNumber(period.invoice_buyer_count),
    outstanding_dues: toNumber(now?.overdue_amount),
    sku_count: 0,
    oos_sku_count: 0,
    low_stock_sku_count: 0,
    stock_status: stockStatus,
    oldest_unpaid_days: null,
    is_active: identity.status !== 'inactive',
    invoice_count_90d: toNumber(period.invoice_count),
    estimate_count_90d: toNumber(period.estimate_count),
    estimate_value_90d: toNumber(period.estimate_value),
    order_count_90d: toNumber(period.order_count),
    order_value_90d: toNumber(period.order_value),
    conversion_90d: toNumber(period.estimate_count) > 0
      ? Math.round((toNumber(period.invoice_count) / toNumber(period.estimate_count)) * 100)
      : 0,
    open_estimate_count: openEstimateCount,
    open_order_count: openOrderCount,
    open_demand_count: openEstimateCount + openOrderCount,
    overdue_amount: toNumber(now?.overdue_amount),
    primary_demand_kind: period.primary_demand_kind === 'estimates' ? 'estimates' : period.primary_demand_kind === 'orders' ? 'orders' : 'none',
    primary_demand_count: toNumber(period.primary_demand_count),
    primary_demand_value: toNumber(period.primary_demand_value),
    primary_demand_buyer_count: toNumber(period.primary_demand_buyer_count),
  };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'locations_landing', init, APP_GET_CACHE_CONTROL);

  const claims = await getVerifiedClaims(request);
  const adminCheck = assertSellerAdmin(claims);
  if (!adminCheck.ok) {
    return timedJson({ error: adminCheck.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: adminCheck.status });
  }
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  try {
    const db = supabaseAdmin as unknown as DbClient;
    const tenantId = claims.tenant_id;
    if (!tenantId) return timedJson({ error: 'Unauthorized' }, { status: 401 });
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const sort = parseSort(request.nextUrl.searchParams.get('sort'));
    const cursor = decodeCursor(request.nextUrl.searchParams.get('cursor'));
    const search = request.nextUrl.searchParams.get('search')?.trim() || null;
    const filterPreset = parseFilterPreset(request.nextUrl.searchParams.get('filter_preset'));
    const explicitStatuses = normalizeLocationStatuses(readArrayParam(request.nextUrl.searchParams, 'status'));
    const explicitAttention = normalizeLocationAttention(readArrayParam(request.nextUrl.searchParams, 'attention'));
    const statusFilters = explicitStatuses.length > 0 ? explicitStatuses : statusesFromPreset(filterPreset);
    const attentionFilters = explicitAttention.length > 0 ? explicitAttention : attentionFromPreset(filterPreset);
    const tableSort: SortKey = filterPreset?.open_demand === true && sort === 'invoice_value' ? 'open_demand_value' : sort;
    const period = getSellerLandingPeriodMeta('month');
    const periodStart = period.current_start.slice(0, 10);
    const searchIds = await resolveLocationIdsBySearch(db, tenantId, search);
    const top80 = filterPreset?.cutoff === 'top80';
    const top80AlreadyEmitted = top80 ? Math.max(0, cursor?.n ?? 0) : 0;
    const top80Count = top80 ? await fetchTop80Count(db, tenantId, periodStart) : null;
    const effectiveLimit = top80 && top80Count != null
      ? Math.max(0, Math.min(limit, top80Count - top80AlreadyEmitted))
      : limit;

    if ((searchIds && searchIds.length === 0) || effectiveLimit === 0) {
      return timedJson({ ...EMPTY_RESPONSE, limit, sort: tableSort, refreshed_at: new Date().toISOString(), as_of: new Date().toISOString(), filters: LOCATION_FILTERS });
    }

    if (!top80) {
      const locationIds = await fetchLocationUniverseIds(db, tenantId, searchIds);
      const [identities, periodById, nowById] = await Promise.all([
        fetchLocationIdentities(db, tenantId, locationIds),
        fetchPeriodRowsByIds(db, tenantId, periodStart, locationIds),
        fetchNowRows(db, tenantId, locationIds),
      ]);
      const matchingRows = locationIds
        .map((id) => {
          const identity = identities.get(id);
          return identity ? mergeLocationRow(identity, periodById.get(id) ?? emptyPeriodRow(id), nowById.get(id)) : null;
        })
        .filter((row): row is LocationsLandingRow => Boolean(row))
        .filter((row) => locationMatchesStatus(row, statusFilters) && locationMatchesAttention(row, attentionFilters))
        .sort((left, right) => compareLocations(left, right, tableSort));
      const cursorFiltered = applyLocationCursor(matchingRows, tableSort, cursor);
      const pageRowsWithExtra = cursorFiltered.slice(0, limit + 1);
      const locations = pageRowsWithExtra.slice(0, limit);
      const extraRow = pageRowsWithExtra[limit] ?? null;
      const last = locations[locations.length - 1] ?? null;

      return timedJson({
        locations,
        total: null,
        limit,
        nextCursor: extraRow && last
          ? encodeCursor({
              v: tableSort === 'overdue_amount' ? last.overdue_amount : tableSort === 'open_demand_value' ? last.primary_demand_value : last.gmv_mtd,
              i: last.id,
            })
          : null,
        sort: tableSort,
        period_key: 'this_month',
        grain: 'month',
        period_start: periodStart,
        refreshed_at: new Date().toISOString(),
        as_of: new Date().toISOString(),
        filters: LOCATION_FILTERS,
      } satisfies LocationsLandingResponse);
    }

    if (filterPreset?.overdue === true || filterPreset?.open_demand === true || tableSort === 'overdue_amount' || tableSort === 'open_demand_value') {
      let nowQuery = db
        .schema('app')
        .from('metrics_location_now_summary')
        .select('location_id, open_estimate_count, open_order_count, overdue_amount')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (searchIds) nowQuery = nowQuery.in('location_id', searchIds);
      if (filterPreset?.overdue === true) nowQuery = nowQuery.gt('overdue_amount', 0);
      if (filterPreset?.open_demand === true) nowQuery = nowQuery.or('open_estimate_count.gt.0,open_order_count.gt.0');
      nowQuery = applyNowKeyset(nowQuery, tableSort, cursor)
      if (tableSort === 'open_demand_value') {
        nowQuery = nowQuery.order('open_order_count', { ascending: false }).order('open_estimate_count', { ascending: false });
      } else {
        nowQuery = nowQuery.order('overdue_amount', { ascending: false });
      }
      nowQuery = nowQuery.order('location_id', { ascending: true }).limit(effectiveLimit + 1);

      const { data: nowData, error: nowError } = await nowQuery;
      if (nowError) throw nowError;

      const nowRows = (nowData ?? []) as NowRow[];
      const pageNowRows = nowRows.slice(0, effectiveLimit);
      const extraNowRow = nowRows[effectiveLimit] ?? null;
      const locationIds = pageNowRows.map((row) => row.location_id);
      const periodById = await fetchPeriodRowsByIds(db, tenantId, periodStart, locationIds);
      const identities = await fetchLocationIdentities(db, tenantId, locationIds);
      const nowById = new Map(pageNowRows.map((row) => [row.location_id, row]));
      const locations = pageNowRows
        .map((now) => {
          const identity = identities.get(now.location_id);
          return identity ? mergeLocationRow(identity, periodById.get(now.location_id) ?? emptyPeriodRow(now.location_id), now) : null;
        })
        .filter((row): row is LocationsLandingRow => Boolean(row));
      const last = pageNowRows[pageNowRows.length - 1] ?? null;

      return timedJson({
        locations,
        total: null,
        limit,
        nextCursor: extraNowRow && last
          ? encodeCursor({
              v: sortValue(periodById.get(last.location_id) ?? emptyPeriodRow(last.location_id), nowById.get(last.location_id), tableSort),
              i: last.location_id,
              n: top80 ? top80AlreadyEmitted + pageNowRows.length : undefined,
              e: tableSort === 'open_demand_value' ? toNumber(last.open_estimate_count) : undefined,
            })
          : null,
        sort: tableSort,
        period_key: 'this_month',
        grain: 'month',
        period_start: periodStart,
        refreshed_at: new Date().toISOString(),
        as_of: new Date().toISOString(),
        filters: LOCATION_FILTERS,
      } satisfies LocationsLandingResponse);
    }

    let query = db
      .schema('app')
      .from('metrics_location_period_summary')
      .select(
        'location_id, invoice_count, invoice_value, invoice_buyer_count, estimate_count, estimate_value, order_count, order_value, primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count',
      )
      .eq('tenant_id', tenantId)
      .eq('grain', 'month')
      .eq('period_start', periodStart)
      .is('deleted_at', null);

    if (searchIds) query = query.in('location_id', searchIds);
    if (top80) query = query.gt('invoice_value', 0);
    if (tableSort === 'invoice_value' || top80) query = query.order('invoice_value', { ascending: false });
    query = applyKeyset(query, top80 ? 'invoice_value' : tableSort, cursor).order('location_id', { ascending: true }).limit(effectiveLimit + 1);

    const { data: periodData, error: periodError } = await query;
    if (periodError) throw periodError;

    let periodRows = ((periodData ?? []) as PeriodRow[]).slice(0, effectiveLimit);
    const extraRow = ((periodData ?? []) as PeriodRow[])[effectiveLimit] ?? null;
    const periodLocationIds = periodRows.map((row) => row.location_id);
    const nowById = await fetchNowRows(db, tenantId, periodLocationIds);

    const identities = await fetchLocationIdentities(db, tenantId, periodRows.map((row) => row.location_id));
    const locations = periodRows
      .map((row) => {
        const identity = identities.get(row.location_id);
        return identity ? mergeLocationRow(identity, row, nowById.get(row.location_id)) : null;
      })
      .filter((row): row is LocationsLandingRow => Boolean(row));

    const last = periodRows[periodRows.length - 1] ?? null;
    const nextCursor = extraRow && last
      ? encodeCursor({
          v: sortValue(last, nowById.get(last.location_id), top80 ? 'invoice_value' : tableSort),
          i: last.location_id,
          n: top80 ? top80AlreadyEmitted + periodRows.length : undefined,
        })
      : null;

    return timedJson({
      locations,
      total: null,
      limit,
      nextCursor,
      sort: tableSort,
      period_key: 'this_month',
      grain: 'month',
      period_start: periodStart,
      refreshed_at: new Date().toISOString(),
      as_of: new Date().toISOString(),
      filters: LOCATION_FILTERS,
    } satisfies LocationsLandingResponse);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[GET /api/tenant/locations/landing]', err?.code, err?.message);
    return timedJson({ error: 'Failed to fetch locations landing' }, { status: 500 });
  }
}
