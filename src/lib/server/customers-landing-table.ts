import type {
  CustomersLandingTableResponseV4,
  CustomersLandingTableRowV4,
  CustomersLandingTableSort,
} from '@/lib/customers-landing-v4-types';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { PAGE_SIZE } from '@/lib/pagination';

type DbClient = {
  schema: (name: string) => {
    from: (table: string) => any;
  };
};

export type CustomersLandingFilterPreset = {
  purchased_gte?: number;
  period?: string;
  dormant_period?: string;
  overdue?: boolean;
  /** Outstanding Due — receivable_amount > this value (typically 0). */
  receivable_gt?: number;
  /** Account flag on app.buyers (Inactive filter). */
  is_active?: boolean;
  /** Buyer App access flag on app.buyers. */
  buyer_app_enabled?: boolean;
  sort?: string;
  cutoff?: string;
};

export type CustomersLandingTableQuery = {
  tenantId: string;
  limit: number;
  cursor: string | null;
  sort: CustomersLandingTableSort;
  search: string | null;
  filterPreset: CustomersLandingFilterPreset | null;
};

type PeriodRow = {
  buyer_id: string;
  external_ref: string;
  invoice_value: number | string;
  invoice_count: number | string;
  estimate_value: number | string;
  estimate_count: number | string;
  order_value: number | string;
  order_count: number | string;
  app_demand_value: number | string;
  app_demand_count: number | string;
};

type NowRow = {
  buyer_id: string;
  external_ref: string;
  receivable_amount: number | string;
  overdue_amount: number | string;
  credit_limit: number | string;
  credit_available: number | string;
};

type BuyerIdentity = {
  business_name: string;
  phone: string | null;
  is_active: boolean;
  buyer_app_enabled: boolean;
};

type CursorPayload = {
  v: number;
  i: string;
  /** Rows already emitted under a top80 cutoff (absolute rank offset). */
  n?: number;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function quarterPeriodBounds(now = new Date()): { currentStart: string; previousStart: string } {
  const meta = getSellerLandingPeriodMeta('quarter', now);
  return {
    currentStart: meta.current_start.slice(0, 10),
    previousStart: meta.previous_start.slice(0, 10),
  };
}

export function encodeCustomersTableCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCustomersTableCursor(cursor: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Partial<CursorPayload>;
    if (typeof parsed.v !== 'number' || typeof parsed.i !== 'string') return null;
    return {
      v: parsed.v,
      i: parsed.i,
      n: typeof parsed.n === 'number' ? parsed.n : undefined,
    };
  } catch {
    return null;
  }
}

export function parseCustomersTableSort(value: string | null | undefined): CustomersLandingTableSort {
  if (value === 'receivable_amount' || value === 'overdue_amount' || value === 'invoice_value') {
    return value;
  }
  return 'invoice_value';
}

export function parseCustomersFilterPreset(raw: string | null | undefined): CustomersLandingFilterPreset | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as CustomersLandingFilterPreset;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function sortColumn(sort: CustomersLandingTableSort): string {
  return sort;
}

function sortValueFromPeriod(row: PeriodRow, sort: CustomersLandingTableSort): number {
  if (sort === 'invoice_value') return toNumber(row.invoice_value);
  return 0;
}

function sortValueFromNow(row: NowRow, sort: CustomersLandingTableSort): number {
  if (sort === 'receivable_amount') return toNumber(row.receivable_amount);
  if (sort === 'overdue_amount') return toNumber(row.overdue_amount);
  return 0;
}

function applyKeyset(
  query: any,
  sort: CustomersLandingTableSort,
  cursor: CursorPayload | null,
  descending: boolean,
) {
  if (!cursor) return query;
  const col = sortColumn(sort);
  // (sort_col, buyer_id) keyset — DESC on sort_col, ASC on buyer_id for stable pages
  if (descending) {
    return query.or(
      `${col}.lt.${cursor.v},and(${col}.eq.${cursor.v},buyer_id.gt.${cursor.i})`,
    );
  }
  return query.or(
    `${col}.gt.${cursor.v},and(${col}.eq.${cursor.v},buyer_id.gt.${cursor.i})`,
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeCustomersSearch(value: string): string {
  return value.replace(/[*(),]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve free-text search to buyer ids (name, phone, external_ref).
 * Returns null when there is no search term.
 */
async function resolveCustomersSearchBuyerIds(
  db: DbClient,
  tenantId: string,
  search: string | null,
): Promise<string[] | null> {
  if (!search) return null;
  if (isUuid(search)) return [search];

  const normalized = normalizeCustomersSearch(search);
  if (!normalized) return null;

  const likeValue = `%${normalized}%`;
  const digits = normalized.replace(/\D/g, '');
  const digitLike = digits.length >= 4 ? `%${digits}%` : null;

  const buyersBase = () =>
    db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .limit(BUYER_FLAG_ID_CAP);

  const [byNameFts, byName, byPhone, byPhoneDigits, byRef] = await Promise.all([
    // Indexed (idx_buyers_search_vector) whole-word/multi-word match — fast
    // path for the common case, resolved via GIN instead of a seq scan.
    buyersBase().textSearch('search_vector', normalized, { type: 'websearch', config: 'english' }),
    // Kept alongside FTS: tsvector lexeme matching doesn't do partial-word
    // prefixes ("cam" won't match "Camline"), so ILIKE substring search stays
    // as the fallback for prefix-as-you-type queries. Bounded by BUYER_FLAG_ID_CAP.
    buyersBase().ilike('business_name', likeValue),
    buyersBase().ilike('phone', likeValue),
    digitLike ? buyersBase().ilike('phone', digitLike) : Promise.resolve({ data: [], error: null }),
    db
      .schema('app')
      .from('metrics_buyer_now_summary')
      .select('buyer_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .ilike('external_ref', likeValue)
      .limit(BUYER_FLAG_ID_CAP),
  ]);

  if (byNameFts.error) throw new Error(byNameFts.error.message ?? 'Failed to search buyers by name (fts)');
  if (byName.error) throw new Error(byName.error.message ?? 'Failed to search buyers by name');
  if (byPhone.error) throw new Error(byPhone.error.message ?? 'Failed to search buyers by phone');
  if (byPhoneDigits.error) {
    throw new Error(byPhoneDigits.error.message ?? 'Failed to search buyers by phone digits');
  }
  if (byRef.error) throw new Error(byRef.error.message ?? 'Failed to search buyers by ref');

  const ids = new Set<string>();
  for (const row of (byNameFts.data ?? []) as Array<{ id: string }>) ids.add(row.id);
  for (const row of (byName.data ?? []) as Array<{ id: string }>) ids.add(row.id);
  for (const row of (byPhone.data ?? []) as Array<{ id: string }>) ids.add(row.id);
  for (const row of (byPhoneDigits.data ?? []) as Array<{ id: string }>) ids.add(row.id);
  for (const row of (byRef.data ?? []) as Array<{ buyer_id: string }>) ids.add(row.buyer_id);
  return [...ids];
}

async function fetchBuyerIdentities(
  db: DbClient,
  tenantId: string,
  buyerIds: string[],
): Promise<Map<string, BuyerIdentity>> {
  const map = new Map<string, BuyerIdentity>();
  if (buyerIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('buyers')
    .select('id, business_name, phone, is_active, buyer_app_enabled')
    .eq('tenant_id', tenantId)
    .in('id', buyerIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message ?? 'Failed to load buyer names');
  for (const row of (data ?? []) as Array<{
    id: string;
    business_name: string | null;
    phone: string | null;
    is_active: boolean | null;
    buyer_app_enabled: boolean | null;
  }>) {
    map.set(row.id, {
      business_name: row.business_name?.trim() || 'Customer',
      phone: row.phone?.trim() || null,
      is_active: row.is_active !== false,
      buyer_app_enabled: row.buyer_app_enabled === true,
    });
  }
  return map;
}

async function fetchNowByBuyerIds(
  db: DbClient,
  tenantId: string,
  buyerIds: string[],
): Promise<Map<string, NowRow>> {
  const map = new Map<string, NowRow>();
  if (buyerIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_buyer_now_summary')
    .select('buyer_id, external_ref, receivable_amount, overdue_amount, credit_limit, credit_available')
    .eq('tenant_id', tenantId)
    .in('buyer_id', buyerIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message ?? 'Failed to load buyer now summaries');
  for (const row of (data ?? []) as NowRow[]) {
    map.set(row.buyer_id, row);
  }
  return map;
}

async function fetchPeriodByBuyerIds(
  db: DbClient,
  tenantId: string,
  periodStart: string,
  buyerIds: string[],
): Promise<Map<string, PeriodRow>> {
  const map = new Map<string, PeriodRow>();
  if (buyerIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_buyer_period_summary')
    .select(
      'buyer_id, external_ref, invoice_value, invoice_count, estimate_value, estimate_count, order_value, order_count, app_demand_value, app_demand_count',
    )
    .eq('tenant_id', tenantId)
    .eq('grain', 'quarter')
    .eq('period_start', periodStart)
    .in('buyer_id', buyerIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message ?? 'Failed to load buyer period summaries');
  for (const row of (data ?? []) as PeriodRow[]) {
    map.set(row.buyer_id, row);
  }
  return map;
}

function mergeRow(
  buyerId: string,
  identity: BuyerIdentity | undefined,
  period: PeriodRow | undefined,
  now: NowRow | undefined,
): CustomersLandingTableRowV4 {
  const creditLimit = toNumber(now?.credit_limit);
  const creditAvailable = toNumber(now?.credit_available);
  return {
    id: buyerId,
    business_name: identity?.business_name ?? 'Customer',
    phone: identity?.phone ?? null,
    is_active: identity?.is_active !== false,
    buyer_app_enabled: identity?.buyer_app_enabled === true,
    invoice_value: toNumber(period?.invoice_value),
    invoice_count: toNumber(period?.invoice_count),
    estimate_value: toNumber(period?.estimate_value),
    estimate_count: toNumber(period?.estimate_count),
    order_value: toNumber(period?.order_value),
    order_count: toNumber(period?.order_count),
    app_demand_value: toNumber(period?.app_demand_value),
    app_demand_count: toNumber(period?.app_demand_count),
    receivable_amount: toNumber(now?.receivable_amount),
    overdue_amount: toNumber(now?.overdue_amount),
    credit_limit: creditLimit,
    credit_available: creditAvailable,
    credit_used: Math.max(0, creditLimit - creditAvailable),
  };
}

const BUYER_FLAG_ID_CAP = 5_000;
/** PostgREST `.in(uuid…)` in the query string blows past gateway limits (~100 UUIDs). */
const POSTGREST_IN_SAFE_MAX = 80;
const FLAG_SCAN_BATCH = 200;
const FLAG_SCAN_MAX = 25;
const DORMANT_THIS_Q_PURCHASER_CAP = 10_000;
const DORMANT_PREV_SCAN_BATCH = 200;
const DORMANT_PREV_MAX_SCANS = 25;

/** Buyers with invoice_count > 0 in the given quarter — used to exclude from dormant. */
async function loadQuarterPurchaserIdSet(
  db: DbClient,
  tenantId: string,
  periodStart: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .schema('app')
    .from('metrics_buyer_period_summary')
    .select('buyer_id')
    .eq('tenant_id', tenantId)
    .eq('grain', 'quarter')
    .eq('period_start', periodStart)
    .gt('invoice_count', 0)
    .is('deleted_at', null)
    .limit(DORMANT_THIS_Q_PURCHASER_CAP);
  if (error) throw new Error(error.message ?? 'Failed to load quarter purchasers');
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ buyer_id: string }>) {
    ids.add(row.buyer_id);
  }
  return ids;
}

function buildPeriodSummaryQuery(
  db: DbClient,
  tenantId: string,
  periodStart: string,
  searchUuid: string | null,
  searchRef: string | null,
) {
  let q = db
    .schema('app')
    .from('metrics_buyer_period_summary')
    .select(
      'buyer_id, external_ref, invoice_value, invoice_count, estimate_value, estimate_count, order_value, order_count, app_demand_value, app_demand_count',
    )
    .eq('tenant_id', tenantId)
    .eq('grain', 'quarter')
    .eq('period_start', periodStart)
    .is('deleted_at', null);

  if (searchUuid) {
    q = q.eq('buyer_id', searchUuid);
  } else if (searchRef) {
    q = q.ilike('external_ref', `%${searchRef}%`);
  }
  return q;
}

/**
 * Dormant = invoice_count > 0 last quarter AND invoice_count = 0 this quarter.
 * Base pages from previous-quarter period_summary; exclude this-quarter purchasers in memory
 * (PostgREST cannot express NOT EXISTS across two period_start values).
 * Display QTD columns come from this-quarter period rows (typically absent → zeros);
 * outstanding/overdue/credit come from now_summary after the page is selected.
 */
async function fetchDormantPeriodPage(
  db: DbClient,
  query: CustomersLandingTableQuery,
  currentStart: string,
  previousStart: string,
  limit: number,
  cursor: CursorPayload | null,
  searchUuid: string | null,
  searchRef: string | null,
  flaggedBuyerIds: string[] | null = null,
): Promise<CustomersLandingTableResponseV4> {
  const sort: CustomersLandingTableSort = 'invoice_value';
  const thisQuarterPurchasers = await loadQuarterPurchaserIdSet(db, query.tenantId, currentStart);
  const { inIds: flagInIds, scanSet: flagScanSet } = buyerUniverseForQuery(flaggedBuyerIds);
  const scanBatch = Math.max(limit * 4, DORMANT_PREV_SCAN_BATCH);
  let scanCursor = cursor;
  const dormantPrevRows: PeriodRow[] = [];
  let lastScanned: PeriodRow | null = null;
  let lastBatchFull = false;

  for (let scan = 0; scan < DORMANT_PREV_MAX_SCANS && dormantPrevRows.length < limit + 1; scan++) {
    let q = buildPeriodSummaryQuery(db, query.tenantId, previousStart, searchUuid, searchRef);
    q = q.gt('invoice_count', 0);
    // Never `.in()` a large buyer-app/inactive universe — scan-filter instead.
    if (flagInIds) q = q.in('buyer_id', flagInIds);
    q = q.order(sortColumn(sort), { ascending: false }).order('buyer_id', { ascending: true });
    q = applyKeyset(q, sort, scanCursor, true);
    q = q.limit(scanBatch);

    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed to load customers');

    const batch = (data ?? []) as PeriodRow[];
    lastBatchFull = batch.length === scanBatch;
    if (batch.length === 0) break;

    for (const row of batch) {
      lastScanned = row;
      if (flagScanSet && !flagScanSet.has(row.buyer_id)) continue;
      if (!thisQuarterPurchasers.has(row.buyer_id)) {
        dormantPrevRows.push(row);
        if (dormantPrevRows.length >= limit + 1) break;
      }
    }

    if (dormantPrevRows.length >= limit + 1) break;
    if (!lastBatchFull) break;

    scanCursor = lastScanned
      ? { v: sortValueFromPeriod(lastScanned, sort), i: lastScanned.buyer_id }
      : scanCursor;
  }

  const pagePrev = dormantPrevRows.slice(0, limit);
  const buyerIds = pagePrev.map((r) => r.buyer_id);
  const [currentPeriodMap, nowMap, identityMap] = await Promise.all([
    fetchPeriodByBuyerIds(db, query.tenantId, currentStart, buyerIds),
    fetchNowByBuyerIds(db, query.tenantId, buyerIds),
    fetchBuyerIdentities(db, query.tenantId, buyerIds),
  ]);

  // Display this-quarter metrics (zeros for true dormant); prior-period row only selected the universe.
  const buyers = pagePrev.map((prevRow) =>
    mergeRow(
      prevRow.buyer_id,
      identityMap.get(prevRow.buyer_id),
      currentPeriodMap.get(prevRow.buyer_id),
      nowMap.get(prevRow.buyer_id),
    ),
  );

  const hasMore =
    dormantPrevRows.length > limit || (lastScanned !== null && lastBatchFull);
  const nextCursor =
    hasMore && lastScanned
      ? encodeCustomersTableCursor({
          v: sortValueFromPeriod(lastScanned, sort),
          i: lastScanned.buyer_id,
        })
      : null;

  return {
    buyers,
    nextCursor,
    total: null,
    sort,
    period_start: currentStart,
    grain: 'quarter',
  };
}

function buildNowSummaryQuery(
  db: DbClient,
  tenantId: string,
  searchUuid: string | null,
  searchRef: string | null,
  options: { isOverdue: boolean; receivableGt: number | null },
) {
  let q = db
    .schema('app')
    .from('metrics_buyer_now_summary')
    .select(
      'buyer_id, external_ref, receivable_amount, overdue_amount, credit_limit, credit_available',
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (options.isOverdue) {
    q = q.gt('overdue_amount', 0);
  } else if (options.receivableGt != null) {
    q = q.gt('receivable_amount', options.receivableGt);
  }
  if (searchUuid) {
    q = q.eq('buyer_id', searchUuid);
  } else if (searchRef) {
    q = q.ilike('external_ref', `%${searchRef}%`);
  }
  return q;
}

/** Bounded buyer-id universe for is_active / buyer_app_enabled chips. */
async function loadBuyerIdsByFlags(
  db: DbClient,
  tenantId: string,
  flags: { isActive?: boolean; buyerAppEnabled?: boolean },
): Promise<string[] | null> {
  if (flags.isActive === undefined && flags.buyerAppEnabled === undefined) return null;

  let q = db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(BUYER_FLAG_ID_CAP);

  if (flags.isActive !== undefined) {
    q = q.eq('is_active', flags.isActive);
  }
  if (flags.buyerAppEnabled !== undefined) {
    q = q.eq('buyer_app_enabled', flags.buyerAppEnabled);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message ?? 'Failed to load buyers by flags');
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Prefer a short `.in()` when safe; otherwise return a Set for scan-filter
 * (large Disabled-buyer universes were returning PostgREST "Bad Request").
 */
export function buyerUniverseForQuery(ids: string[] | null | undefined): {
  inIds: string[] | null;
  scanSet: Set<string> | null;
} {
  if (!ids) return { inIds: null, scanSet: null };
  if (ids.length <= POSTGREST_IN_SAFE_MAX) {
    return { inIds: ids, scanSet: null };
  }
  return { inIds: null, scanSet: new Set(ids) };
}

async function loadTop80Count(
  db: DbClient,
  tenantId: string,
  periodStart: string,
): Promise<number> {
  const { data, error } = await db
    .schema('app')
    .from('metrics_tenant_top80_cache')
    .select('top80_count')
    .eq('tenant_id', tenantId)
    .eq('entity_kind', 'customers')
    .eq('grain', 'quarter')
    .eq('period_start', periodStart)
    .maybeSingle();
  if (error) throw new Error(error.message ?? 'Failed to load top80 cache');
  return toNumber((data as { top80_count?: number } | null)?.top80_count);
}

/**
 * Paginated customers landing rows from V4 buyer summaries only.
 * Buyers join is display-only after the page is selected — except when
 * is_active / buyer_app_enabled chips require a buyers-table id universe first.
 */
export async function fetchCustomersLandingTable(
  db: DbClient,
  query: CustomersLandingTableQuery,
): Promise<CustomersLandingTableResponseV4> {
  const { currentStart: periodStart, previousStart } = quarterPeriodBounds();
  const limit = Math.min(Math.max(query.limit, 1), PAGE_SIZE.MAX);
  const cursor = decodeCustomersTableCursor(query.cursor);
  const preset = query.filterPreset;
  const isOverdue = preset?.overdue === true;
  const receivableGt =
    typeof preset?.receivable_gt === 'number' && Number.isFinite(preset.receivable_gt)
      ? preset.receivable_gt
      : null;
  const isDormant = typeof preset?.dormant_period === 'string';
  const isActive =
    typeof preset?.purchased_gte === 'number' && preset.purchased_gte >= 1;
  const isTop80 = preset?.cutoff === 'top80';
  const buyerFlagIsActive =
    typeof preset?.is_active === 'boolean' ? preset.is_active : undefined;
  const buyerFlagAppEnabled =
    typeof preset?.buyer_app_enabled === 'boolean' ? preset.buyer_app_enabled : undefined;

  const searchTrim = query.search?.trim() || null;
  const searchBuyerIds = await resolveCustomersSearchBuyerIds(db, query.tenantId, searchTrim);
  if (searchBuyerIds && searchBuyerIds.length === 0) {
    return {
      buyers: [],
      nextCursor: null,
      total: 0,
      sort: query.sort,
      period_start: periodStart,
      grain: 'quarter',
    };
  }

  const flaggedBuyerIds = await loadBuyerIdsByFlags(db, query.tenantId, {
    isActive: buyerFlagIsActive,
    buyerAppEnabled: buyerFlagAppEnabled,
  });
  // Empty flag universe → empty page (don't fall through to unfiltered)
  if (flaggedBuyerIds && flaggedBuyerIds.length === 0) {
    return {
      buyers: [],
      nextCursor: null,
      total: 0,
      sort: query.sort,
      period_start: periodStart,
      grain: 'quarter',
    };
  }

  // Intersect text/phone search with flag chips into one buyer universe.
  let universeBuyerIds = flaggedBuyerIds;
  if (searchBuyerIds) {
    const searchSet = new Set(searchBuyerIds);
    universeBuyerIds = universeBuyerIds
      ? universeBuyerIds.filter((id) => searchSet.has(id))
      : searchBuyerIds;
    if (universeBuyerIds.length === 0) {
      return {
        buyers: [],
        nextCursor: null,
        total: 0,
        sort: query.sort,
        period_start: periodStart,
        grain: 'quarter',
      };
    }
  }

  // Search is applied via universeBuyerIds — do not also filter by external_ref on the base query.
  const searchUuid = null;
  const searchRef = null;

  // Dormant: last-quarter purchasers with no this-quarter invoices (period_summary only).
  if (isDormant) {
    return fetchDormantPeriodPage(
      db,
      query,
      periodStart,
      previousStart,
      limit,
      cursor,
      searchUuid,
      searchRef,
      universeBuyerIds,
    );
  }

  let sort: CustomersLandingTableSort = query.sort;
  if (isTop80) sort = 'invoice_value';
  if (isOverdue && sort === 'invoice_value') sort = 'overdue_amount';
  if (receivableGt != null && sort === 'invoice_value') sort = 'receivable_amount';

  // Sort keys that live only on now_summary must use now as the page base.
  const sortNeedsNowBase = sort === 'receivable_amount' || sort === 'overdue_amount';
  const useNowBase = isOverdue || receivableGt != null || sortNeedsNowBase;

  // --- Base from now summary (overdue / due / outstanding|overdue sort) ---
  if (useNowBase) {
    // Active KPI/chip must survive outstanding sorts (now-base would otherwise drop purchased_gte).
    let nowUniverseIds = universeBuyerIds;
    if (isActive || isTop80) {
      const purchasers = await loadQuarterPurchaserIdSet(db, query.tenantId, periodStart);
      const purchaserIds = [...purchasers];
      nowUniverseIds = nowUniverseIds
        ? nowUniverseIds.filter((id) => purchasers.has(id))
        : purchaserIds;
      if (nowUniverseIds.length === 0) {
        return {
          buyers: [],
          nextCursor: null,
          total: 0,
          sort,
          period_start: periodStart,
          grain: 'quarter',
        };
      }
    }

    const { inIds: nowInIds, scanSet: nowScanSet } = buyerUniverseForQuery(nowUniverseIds);
    const needsScan = nowScanSet != null;
    const scanBatch = Math.max(limit * 4, FLAG_SCAN_BATCH);
    let scanCursor = cursor;
    const keptNow: NowRow[] = [];
    let lastScanned: NowRow | null = null;
    let lastBatchFull = false;

    for (
      let scan = 0;
      scan < (needsScan ? FLAG_SCAN_MAX : 1) && keptNow.length < limit + 1;
      scan++
    ) {
      let q = buildNowSummaryQuery(db, query.tenantId, searchUuid, searchRef, {
        isOverdue,
        receivableGt,
      });
      if (nowInIds) q = q.in('buyer_id', nowInIds);
      q = q.order(sortColumn(sort), { ascending: false }).order('buyer_id', { ascending: true });
      q = applyKeyset(q, sort, scanCursor, true);
      q = q.limit(needsScan ? scanBatch : limit + 1);

      const { data, error } = await q;
      if (error) throw new Error(error.message ?? 'Failed to load customers');

      const batch = (data ?? []) as NowRow[];
      lastBatchFull = needsScan && batch.length === scanBatch;
      if (batch.length === 0) break;

      for (const row of batch) {
        lastScanned = row;
        if (nowScanSet && !nowScanSet.has(row.buyer_id)) continue;
        keptNow.push(row);
        if (keptNow.length >= limit + 1) break;
      }

      if (!needsScan) break;
      if (keptNow.length >= limit + 1) break;
      if (!lastBatchFull) break;
      scanCursor = lastScanned
        ? { v: sortValueFromNow(lastScanned, sort), i: lastScanned.buyer_id }
        : scanCursor;
    }

    const pageNow = keptNow.slice(0, limit);
    const buyerIds = pageNow.map((r) => r.buyer_id);
    const [periodMap, identityMap] = await Promise.all([
      fetchPeriodByBuyerIds(db, query.tenantId, periodStart, buyerIds),
      fetchBuyerIdentities(db, query.tenantId, buyerIds),
    ]);

    const buyers = pageNow.map((row) =>
      mergeRow(row.buyer_id, identityMap.get(row.buyer_id), periodMap.get(row.buyer_id), row),
    );

    const hasMore = keptNow.length > limit || (needsScan && lastScanned != null && lastBatchFull);
    const last = pageNow[pageNow.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCustomersTableCursor({
            v: sortValueFromNow(last, sort),
            i: last.buyer_id,
          })
        : null;

    return {
      buyers,
      nextCursor,
      total: null,
      sort,
      period_start: periodStart,
      grain: 'quarter',
    };
  }

  // --- Base from period summary (default / active / top80) ---
  const { inIds: periodInIds, scanSet: periodScanSet } = buyerUniverseForQuery(universeBuyerIds);
  const needsPeriodScan = periodScanSet != null;
  const top80Count = isTop80 ? await loadTop80Count(db, query.tenantId, periodStart) : null;
  const emitted = cursor?.n ?? 0;
  if (isTop80 && top80Count != null && emitted >= top80Count) {
    return {
      buyers: [],
      nextCursor: null,
      total: top80Count,
      sort,
      period_start: periodStart,
      grain: 'quarter',
    };
  }

  const pageTarget =
    isTop80 && top80Count != null
      ? Math.min(limit, Math.max(0, top80Count - emitted)) + 1
      : limit + 1;
  const scanBatch = Math.max(limit * 4, FLAG_SCAN_BATCH);
  let scanCursor = cursor;
  const keptPeriod: PeriodRow[] = [];
  let lastScannedPeriod: PeriodRow | null = null;
  let lastBatchFull = false;

  for (
    let scan = 0;
    scan < (needsPeriodScan ? FLAG_SCAN_MAX : 1) && keptPeriod.length < pageTarget;
    scan++
  ) {
    let q = buildPeriodSummaryQuery(db, query.tenantId, periodStart, searchUuid, searchRef);

    if (isActive || isTop80) {
      q = q.gt('invoice_count', 0);
    }
    if (isTop80) {
      q = q.gt('invoice_value', 0);
    }
    if (periodInIds) {
      q = q.in('buyer_id', periodInIds);
    }

    q = q.order(sortColumn(sort), { ascending: false }).order('buyer_id', { ascending: true });
    q = applyKeyset(q, sort, scanCursor, true);
    q = q.limit(needsPeriodScan ? scanBatch : pageTarget);

    const { data, error } = await q;
    if (error) throw new Error(error.message ?? 'Failed to load customers');

    const batch = (data ?? []) as PeriodRow[];
    lastBatchFull = needsPeriodScan && batch.length === scanBatch;
    if (batch.length === 0) break;

    for (const row of batch) {
      lastScannedPeriod = row;
      if (periodScanSet && !periodScanSet.has(row.buyer_id)) continue;
      keptPeriod.push(row);
      if (keptPeriod.length >= pageTarget) break;
    }

    if (!needsPeriodScan) break;
    if (keptPeriod.length >= pageTarget) break;
    if (!lastBatchFull) break;
    scanCursor = lastScannedPeriod
      ? { v: sortValueFromPeriod(lastScannedPeriod, sort), i: lastScannedPeriod.buyer_id }
      : scanCursor;
  }

  const pagePeriod = keptPeriod.slice(0, limit);
  const cappedPeriod =
    isTop80 && top80Count != null
      ? pagePeriod.slice(0, Math.max(0, top80Count - emitted))
      : pagePeriod;

  const buyerIds = cappedPeriod.map((r) => r.buyer_id);
  const [nowMap, identityMap] = await Promise.all([
    fetchNowByBuyerIds(db, query.tenantId, buyerIds),
    fetchBuyerIdentities(db, query.tenantId, buyerIds),
  ]);

  const buyers = cappedPeriod.map((row) =>
    mergeRow(row.buyer_id, identityMap.get(row.buyer_id), row, nowMap.get(row.buyer_id)),
  );

  const nextEmitted = emitted + buyers.length;
  const hasMoreByPage =
    keptPeriod.length > cappedPeriod.length ||
    (needsPeriodScan && lastScannedPeriod != null && lastBatchFull);
  const hasMoreByTop80 = isTop80 && top80Count != null ? nextEmitted < top80Count && hasMoreByPage : hasMoreByPage;
  const last = cappedPeriod[cappedPeriod.length - 1];
  const nextCursor =
    hasMoreByTop80 && last
      ? encodeCustomersTableCursor({
          v: sortValueFromPeriod(last, sort),
          i: last.buyer_id,
          n: isTop80 ? nextEmitted : undefined,
        })
      : null;

  return {
    buyers,
    nextCursor,
    total: isTop80 ? top80Count : null,
    sort,
    period_start: periodStart,
    grain: 'quarter',
  };
}
