import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PAGE_SIZE } from '@/lib/pagination';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

type BuyerRow = {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  phone: string | null;
  gst_treatment: string | null;
  zoho_status: string | null;
  is_active: boolean;
  city: string;
  state: string | null;
  cohort: string;
  spend_mtd: number;
  spend_prev_mtd: number;
  growth_pct: number;
  orders_mtd: number;
  last_order_at: string | null;
  credit_limit: number;
  credit_used: number;
  dues: number;
  status: { label: string; tone: StatusTone };
  avatar: { initials: string; hue: 'teal' | 'ember' | 'cream' };
  active_price_list: {
    name: string;
    source: 'direct' | 'cohort';
    cohort_name?: string | null;
  } | null;
  whatsapp_opted_out: boolean;
};

type CustomersLandingBuyerDbRow = {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  phone: string | null;
  gst_treatment: string | null;
  status: string | null;
  credit_limit: number | null;
  is_active: boolean;
  geography: { city?: string; state?: string } | null;
  whatsapp_opt_out_at: string | null;
};

type PriceListAssignmentRow = {
  target_id: string | null;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  price_list_id: string;
  created_at: string | null;
  price_lists?: {
    id: string;
    name: string;
    priority: number;
  } | null;
};

type CohortMembershipRow = {
  buyer_id: string;
  cohort_id: string;
  cohort: {
    id: string;
    name: string;
    deleted_at: string | null;
  } | null;
};

type BuyerSnapshotRow = {
  buyer_id: string;
  is_active: boolean | null;
  is_dormant: boolean | null;
  outstanding_dues: number | null;
  overdue_amount: number | null;
  credit_limit: number | null;
  last_order_at: string | null;
  last_activity_at: string | null;
};

type BuyerKpiRow = {
  buyer_id: string;
  estimates_count: number | null;
  orders_count: number | null;
  invoices_count: number | null;
  orders_gmv: number | null;
};

type AggregatedBuyerSnapshot = {
  buyer_id: string;
  is_active: boolean;
  is_dormant: boolean;
  outstanding_dues: number;
  overdue_amount: number;
  credit_limit: number;
  last_order_at: string | null;
  last_activity_at: string | null;
};

type AggregatedBuyerKpi = {
  buyer_id: string;
  estimates_count: number;
  orders_count: number;
  invoices_count: number;
  orders_gmv: number;
};

const CUSTOMERS_LANDING_CACHE_TTL_MS = 20_000;
const customersLandingCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getInitials(name: string) {
  return name
    .split(' ')
    .map((v) => v[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatLastOrder(date: string | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function encodeCursor(row: { business_name: string; id: string }): string {
  return Buffer.from(JSON.stringify({ n: row.business_name, i: row.id })).toString('base64url');
}

function decodeCursor(cursor: string): { business_name: string; id: string } {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { n: string; i: string };
  return { business_name: parsed.n, id: parsed.i };
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function maxIso(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function aggregateBuyerSnapshots(
  rows: BuyerSnapshotRow[],
  dormantCutoffIso: string,
): Map<string, AggregatedBuyerSnapshot> {
  const byBuyer = new Map<string, AggregatedBuyerSnapshot>();

  for (const row of rows) {
    const current = byBuyer.get(row.buyer_id) ?? {
      buyer_id: row.buyer_id,
      is_active: Boolean(row.is_active),
      is_dormant: Boolean(row.is_dormant),
      outstanding_dues: 0,
      overdue_amount: 0,
      credit_limit: 0,
      last_order_at: null,
      last_activity_at: null,
    };

    current.is_active = current.is_active || Boolean(row.is_active);
    current.outstanding_dues += toNumber(row.outstanding_dues);
    current.overdue_amount += toNumber(row.overdue_amount);
    current.credit_limit = Math.max(current.credit_limit, toNumber(row.credit_limit));
    current.last_order_at = maxIso(current.last_order_at, row.last_order_at);
    current.last_activity_at = maxIso(current.last_activity_at, row.last_activity_at);
    byBuyer.set(row.buyer_id, current);
  }

  for (const snapshot of byBuyer.values()) {
    const activityAt = snapshot.last_activity_at ?? snapshot.last_order_at;
    snapshot.is_dormant = !activityAt || activityAt < dormantCutoffIso;
  }

  return byBuyer;
}

function aggregateBuyerKpis(rows: BuyerKpiRow[]): Map<string, AggregatedBuyerKpi> {
  const byBuyer = new Map<string, AggregatedBuyerKpi>();

  for (const row of rows) {
    const current = byBuyer.get(row.buyer_id) ?? {
      buyer_id: row.buyer_id,
      estimates_count: 0,
      orders_count: 0,
      invoices_count: 0,
      orders_gmv: 0,
    };

    current.estimates_count += toNumber(row.estimates_count);
    current.orders_count += toNumber(row.orders_count);
    current.invoices_count += toNumber(row.invoices_count);
    current.orders_gmv += toNumber(row.orders_gmv);
    byBuyer.set(row.buyer_id, current);
  }

  return byBuyer;
}

function buildBuyerStatus(snapshot: AggregatedBuyerSnapshot, growthPct: number): BuyerRow['status'] {
  if (snapshot.is_dormant) return { label: 'Dormant', tone: 'danger' };
  if (snapshot.overdue_amount > 0 || snapshot.outstanding_dues > 80000 || growthPct < 0) {
    return { label: 'Needs follow-up', tone: 'warning' };
  }
  return { label: 'Healthy', tone: 'success' };
}

function buildBuyerRow(
  buyer: CustomersLandingBuyerDbRow,
  index: number,
  snapshot: AggregatedBuyerSnapshot | undefined,
  currentKpi: AggregatedBuyerKpi | undefined,
  previousKpi: AggregatedBuyerKpi | undefined,
  cohortLabel: string,
  activePriceList: BuyerRow['active_price_list'],
): BuyerRow {
  const spend_mtd = currentKpi?.orders_gmv ?? 0;
  const spend_prev_mtd = previousKpi?.orders_gmv ?? 0;
  const growth_pct = spend_prev_mtd > 0
    ? Math.round((((spend_mtd - spend_prev_mtd) / spend_prev_mtd) * 100) * 10) / 10
    : spend_mtd > 0 ? 100 : 0;
  const credit_limit = snapshot?.credit_limit ?? toNumber(buyer.credit_limit);
  const dues = snapshot?.outstanding_dues ?? 0;
  const status = buildBuyerStatus(snapshot ?? {
    buyer_id: buyer.id,
    is_active: Boolean(buyer.is_active),
    is_dormant: false,
    outstanding_dues: 0,
    overdue_amount: 0,
    credit_limit,
    last_order_at: null,
    last_activity_at: null,
  }, growth_pct);

  return {
    id: buyer.id,
    business_name: buyer.business_name,
    tier: buyer.tier,
    phone: buyer.phone ?? null,
    gst_treatment: buyer.gst_treatment ?? null,
    zoho_status: buyer.status ?? null,
    is_active: Boolean(buyer.is_active),
    city: buyer.geography?.city ?? 'Unknown',
    state: buyer.geography?.state ?? null,
    cohort: cohortLabel,
    spend_mtd,
    spend_prev_mtd,
    growth_pct,
    orders_mtd: currentKpi?.orders_count ?? 0,
    last_order_at: snapshot?.last_order_at ?? null,
    credit_limit,
    credit_used: dues,
    dues,
    status,
    avatar: {
      initials: getInitials(buyer.business_name),
      hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
    },
    active_price_list: activePriceList,
    whatsapp_opted_out: Boolean(buyer.whatsapp_opt_out_at),
  };
}

async function loadAccessibleBuyerIds(
  db: any,
  tenantId: string,
  locationIds: string[],
): Promise<Set<string>> {
  if (locationIds.length === 0) return new Set();

  const [ordersRes, estimatesRes, invoicesRes] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('buyer_id')
      .eq('tenant_id', tenantId)
      .in('location_id', locationIds)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('estimates')
      .select('buyer_id')
      .eq('tenant_id', tenantId)
      .in('location_id', locationIds)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('invoices')
      .select('buyer_id')
      .eq('tenant_id', tenantId)
      .in('location_id', locationIds)
      .is('deleted_at', null),
  ]);

  const ids = new Set<string>();
  for (const res of [ordersRes, estimatesRes, invoicesRes]) {
    if (res.error) {
      console.error('[GET /api/tenant/customers] failed to scope assistant buyers', res.error);
      continue;
    }
    for (const row of res.data ?? []) {
      if (typeof row.buyer_id === 'string' && row.buyer_id.length > 0) {
        ids.add(row.buyer_id);
      }
    }
  }

  return ids;
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'customers_api', init, APP_GET_CACHE_CONTROL);
  };

  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
    if (!flagEnabled) {
      return timedJson({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;
    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];

    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));
    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dormantCutoff = new Date(istNow);
    dormantCutoff.setDate(dormantCutoff.getDate() - 30);
    const dormantCutoffIso = dormantCutoff.toISOString();

    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const dueParams = readArrayParam(req.nextUrl.searchParams, 'due');
    const cacheKey = [
      tenantId,
      claims.role ?? '',
      assistantLocationIds.join('|'),
      limit,
      cursorParam ?? '',
      search,
      statusParams.join('|'),
      dueParams.join('|'),
      period.selected,
      period.current_start.slice(0, 10),
      period.current_end_exclusive.slice(0, 10),
      period.previous_start.slice(0, 10),
      period.previous_end_exclusive.slice(0, 10),
    ].join(':');

    const cached = customersLandingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return timedJson(cached.payload);
    }

    const buyersSnapshotRes = await (() => {
      let query = db
        .schema('app')
        .from('buyers_snapshot')
        .select('buyer_id, is_active, is_dormant, outstanding_dues, overdue_amount, credit_limit, last_order_at, last_activity_at')
        .eq('tenant_id', tenantId)
        .eq('scope', isAssistant ? 'location' : 'tenant');

      if (isAssistant) {
        query = assistantLocationIds.length > 0 ? query.in('location_id', assistantLocationIds) : query.limit(0);
      }

      return query;
    })();

    if (buyersSnapshotRes.error) {
      console.error('[GET /api/tenant/customers] buyers_snapshot query failure', buyersSnapshotRes.error);
      return timedJson({ error: 'Failed to fetch customers landing data' }, { status: 500 });
    }

    const aggregatedSnapshots = aggregateBuyerSnapshots(
      (buyersSnapshotRes.data ?? []) as BuyerSnapshotRow[],
      dormantCutoffIso,
    );

    const accessibleBuyerIds = isAssistant
      ? aggregatedSnapshots.size > 0
        ? new Set(aggregatedSnapshots.keys())
        : await loadAccessibleBuyerIds(db, tenantId, assistantLocationIds)
      : new Set(aggregatedSnapshots.keys());

    const buildBuyerQuery = (mode: 'rows' | 'count') => {
      let query = db
        .schema('app')
        .from('buyers')
        .select(
          mode === 'count'
            ? 'id'
            : 'id, business_name, tier, phone, gst_treatment, status, credit_limit, is_active, geography, whatsapp_opt_out_at',
          mode === 'count' ? { count: 'exact', head: true } : undefined,
        )
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('business_name', { ascending: true })
        .order('id', { ascending: true });

      if (isAssistant) {
        const ids = Array.from(accessibleBuyerIds);
        if (ids.length === 0) {
          query = query.in('id', ['00000000-0000-0000-0000-000000000000']);
        } else {
          query = query.in('id', ids);
        }
      }

      if (search) {
        query = query.textSearch('search_vector', search, { type: 'websearch' });
      }
      if (statusParams.length > 0 && !statusParams.includes('Dormant')) {
        const wantsActive = statusParams.includes('Active');
        const wantsInactive = statusParams.includes('Inactive');
        if (wantsActive && !wantsInactive) query = query.eq('is_active', true);
        if (wantsInactive && !wantsActive) query = query.eq('is_active', false);
      }
      if (cursorParam && mode === 'rows') {
        const cursor = decodeCursor(cursorParam);
        query = query.or(`business_name.gt.${cursor.business_name},and(business_name.eq.${cursor.business_name},id.gt.${cursor.id})`);
      }
      if (mode === 'rows') query = query.limit(limit + 1);
      return query;
    };

    const buildBuyerKpiQuery = (start: string, endExclusive: string) => {
      let query = db
        .schema('app')
        .from('kpi_buyers_daily')
        .select('buyer_id, estimates_count, orders_count, invoices_count, orders_gmv')
        .eq('tenant_id', tenantId)
        .eq('scope', isAssistant ? 'location' : 'tenant')
        .gte('day', start.slice(0, 10))
        .lt('day', endExclusive.slice(0, 10));

      if (isAssistant) {
        query = assistantLocationIds.length > 0 ? query.in('location_id', assistantLocationIds) : query.limit(0);
      }

      return query;
    };

    const [buyerRowsRes, buyerCountRes, currentKpiRes, previousKpiRes, cohortMembersRes, priceListAssignmentsRes] = await Promise.all([
      buildBuyerQuery('rows'),
      buildBuyerQuery('count'),
      buildBuyerKpiQuery(period.current_start, period.current_end_exclusive),
      buildBuyerKpiQuery(period.previous_start, period.previous_end_exclusive),
      accessibleBuyerIds.size > 0
        ? db
            .schema('app')
            .from('cohort_members')
            .select('buyer_id, cohort_id, cohort:cohorts(id, name, deleted_at)')
            .in('buyer_id', Array.from(accessibleBuyerIds))
        : Promise.resolve({ data: [], error: null }),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('target_id, target_type, price_list_id, created_at, price_lists!inner(id, name, priority, tenant_id, deleted_at)')
        .is('deleted_at', null)
        .eq('price_lists.tenant_id', tenantId)
        .is('price_lists.deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);

    if (
      buyerRowsRes.error ||
      buyerCountRes.error ||
      currentKpiRes.error ||
      previousKpiRes.error ||
      cohortMembersRes.error
    ) {
      console.error('[GET /api/tenant/customers] query failure', {
        buyers: buyerRowsRes.error,
        buyerCount: buyerCountRes.error,
        currentKpi: currentKpiRes.error,
        previousKpi: previousKpiRes.error,
        cohorts: cohortMembersRes.error,
        priceListAssignments: priceListAssignmentsRes.error,
      });
      return timedJson({ error: 'Failed to fetch customers landing data' }, { status: 500 });
    }

    const currentKpisByBuyer = aggregateBuyerKpis((currentKpiRes.data ?? []) as BuyerKpiRow[]);
    const previousKpisByBuyer = aggregateBuyerKpis((previousKpiRes.data ?? []) as BuyerKpiRow[]);
    const fetchedBuyerRows = (buyerRowsRes.data ?? []) as CustomersLandingBuyerDbRow[];
    const hasNextPage = fetchedBuyerRows.length > limit;
    const buyerRows = hasNextPage ? fetchedBuyerRows.slice(0, limit) : fetchedBuyerRows;

    const priceListAssignments = priceListAssignmentsRes.error ? [] : (priceListAssignmentsRes.data ?? []);
    const buyerDirectPriceListByBuyerId = new Map<string, { name: string; source: 'direct'; cohort_name?: string | null }>();
    const cohortPriceListsByCohortId = new Map<
      string,
      Array<{ name: string; priority: number; created_at: string | null }>
    >();
    for (const row of priceListAssignments as PriceListAssignmentRow[]) {
      const list = row.price_lists;
      if (!list || !row.target_id) continue;
      if (row.target_type === 'buyer' && !buyerDirectPriceListByBuyerId.has(row.target_id)) {
        buyerDirectPriceListByBuyerId.set(row.target_id, {
          name: list.name,
          source: 'direct',
        });
      }
      if (row.target_type === 'cohort') {
        const rows = cohortPriceListsByCohortId.get(row.target_id) ?? [];
        rows.push({
          name: list.name,
          priority: Number(list.priority ?? 0),
          created_at: row.created_at ?? null,
        });
        cohortPriceListsByCohortId.set(row.target_id, rows);
      }
    }

    const cohortMembers = (cohortMembersRes.data ?? []) as CohortMembershipRow[];
    const cohortMap = new Map<string, string>();
    const buyerCohortsByBuyerId = new Map<string, Array<{ id: string; name: string }>>();
    const cohortSet = new Set<string>();
    for (const row of cohortMembers) {
      const cohortName = row.cohort?.name;
      const cohortDeletedAt = row.cohort?.deleted_at;
      if (!cohortName || cohortDeletedAt) continue;
      cohortSet.add(cohortName);
      const cohortList = buyerCohortsByBuyerId.get(row.buyer_id) ?? [];
      cohortList.push({ id: row.cohort_id, name: cohortName });
      buyerCohortsByBuyerId.set(row.buyer_id, cohortList);
      const prev = cohortMap.get(row.buyer_id);
      if (!prev || cohortName.localeCompare(prev) < 0) {
        cohortMap.set(row.buyer_id, cohortName);
      }
    }

    const getActivePriceList = (buyerId: string): BuyerRow['active_price_list'] => {
      const directPriceList = buyerDirectPriceListByBuyerId.get(buyerId) ?? null;
      if (directPriceList) return directPriceList;

      const cohorts = buyerCohortsByBuyerId.get(buyerId) ?? [];
      let best: { name: string; priority: number; created_at: string | null; cohort_name: string } | null = null;
      for (const cohort of cohorts) {
        const options = cohortPriceListsByCohortId.get(cohort.id) ?? [];
        for (const option of options) {
          const candidate = {
            name: option.name,
            priority: option.priority,
            created_at: option.created_at,
            cohort_name: cohort.name,
          };
          if (
            !best
            || candidate.priority > best.priority
            || (candidate.priority === best.priority && (candidate.created_at ?? '') > (best.created_at ?? ''))
          ) {
            best = candidate;
          }
        }
      }
      return best ? { name: best.name, source: 'cohort', cohort_name: best.cohort_name } : null;
    };

    const rows: BuyerRow[] = buyerRows.map((buyer, index) =>
      buildBuyerRow(
        buyer,
        index,
        aggregatedSnapshots.get(buyer.id),
        currentKpisByBuyer.get(buyer.id),
        previousKpisByBuyer.get(buyer.id),
        cohortMap.get(buyer.id) ?? '—',
        getActivePriceList(buyer.id),
      ),
    );

    const filteredRows = rows
      .filter((row) => {
        if (statusParams.length === 0) return true;
        const snapshot = aggregatedSnapshots.get(row.id);
        return statusParams.some((value) => {
          if (value === 'Active') return row.is_active && !(snapshot?.is_dormant ?? false);
          if (value === 'Inactive') return !row.is_active;
          if (value === 'Dormant') return row.is_active && Boolean(snapshot?.is_dormant);
          return false;
        });
      })
      .filter((row) => {
        if (dueParams.length === 0) return true;
        const snapshot = aggregatedSnapshots.get(row.id);
        return dueParams.some((value) => {
          if (value === 'Due') return (snapshot?.outstanding_dues ?? 0) > 0;
          if (value === 'Overdue') return (snapshot?.overdue_amount ?? 0) > 0;
          return false;
        });
      });

    const pageItems = filteredRows.slice(0, limit);
    const lastItem = pageItems.at(-1);
    const nextCursor = hasNextPage && lastItem ? encodeCursor({ business_name: lastItem.business_name, id: lastItem.id }) : null;

    const buyerIdsForCallouts = Array.from(accessibleBuyerIds);
    const sumCurrentSpend = buyerIdsForCallouts.reduce((sum, buyerId) => sum + (currentKpisByBuyer.get(buyerId)?.orders_gmv ?? 0), 0);
    const sumPreviousSpend = buyerIdsForCallouts.reduce((sum, buyerId) => sum + (previousKpisByBuyer.get(buyerId)?.orders_gmv ?? 0), 0);
    const activeBuyerCount = buyerIdsForCallouts.filter((buyerId) => {
      const current = currentKpisByBuyer.get(buyerId);
      return Boolean((current?.estimates_count ?? 0) + (current?.orders_count ?? 0) + (current?.invoices_count ?? 0) > 0);
    }).length;
    const dormantBuyerCount = buyerIdsForCallouts.filter((buyerId) => aggregatedSnapshots.get(buyerId)?.is_dormant).length;
    const outstandingDues = buyerIdsForCallouts.reduce((sum, buyerId) => sum + (aggregatedSnapshots.get(buyerId)?.outstanding_dues ?? 0), 0);
    const buyersWithDues = buyerIdsForCallouts.filter((buyerId) => (aggregatedSnapshots.get(buyerId)?.outstanding_dues ?? 0) > 0).length;

    const universeRowsByBuyerId = new Map<string, BuyerRow>();
    for (const row of rows) {
      universeRowsByBuyerId.set(row.id, row);
    }

    const rankByGrowth = (buyerId: string) => {
      const currentSpend = currentKpisByBuyer.get(buyerId)?.orders_gmv ?? 0;
      const previousSpend = previousKpisByBuyer.get(buyerId)?.orders_gmv ?? 0;
      if (previousSpend <= 0) return currentSpend > 0 ? 100 : 0;
      return Math.round((((currentSpend - previousSpend) / previousSpend) * 100) * 10) / 10;
    };

    const needsCallIds = buyerIdsForCallouts
      .filter((buyerId) => {
        const snapshot = aggregatedSnapshots.get(buyerId);
        return Boolean(snapshot?.is_dormant || (snapshot?.overdue_amount ?? 0) > 0 || (snapshot?.outstanding_dues ?? 0) > 80000 || rankByGrowth(buyerId) < 0);
      })
      .sort((left, right) => {
        const leftScore = (aggregatedSnapshots.get(left)?.overdue_amount ?? 0) + (aggregatedSnapshots.get(left)?.outstanding_dues ?? 0);
        const rightScore = (aggregatedSnapshots.get(right)?.overdue_amount ?? 0) + (aggregatedSnapshots.get(right)?.outstanding_dues ?? 0);
        return rightScore - leftScore;
      })
      .slice(0, 3);
    const topSpenderIds = buyerIdsForCallouts
      .slice()
      .sort((left, right) => (currentKpisByBuyer.get(right)?.orders_gmv ?? 0) - (currentKpisByBuyer.get(left)?.orders_gmv ?? 0))
      .slice(0, 2);
    const topRiserIds = buyerIdsForCallouts
      .filter((buyerId) => rankByGrowth(buyerId) > 0)
      .sort((left, right) => rankByGrowth(right) - rankByGrowth(left))
      .slice(0, 2);

    const calloutBuyerIds = Array.from(new Set([...needsCallIds, ...topSpenderIds, ...topRiserIds]));
    const missingCalloutBuyerIds = calloutBuyerIds.filter((buyerId) => !universeRowsByBuyerId.has(buyerId));
    if (missingCalloutBuyerIds.length > 0) {
      const calloutBuyersRes = await db
        .schema('app')
        .from('buyers')
        .select('id, business_name, tier, phone, gst_treatment, status, credit_limit, is_active, geography, whatsapp_opt_out_at')
        .eq('tenant_id', tenantId)
        .in('id', missingCalloutBuyerIds)
        .is('deleted_at', null);

      if (!calloutBuyersRes.error) {
        for (const [index, buyer] of ((calloutBuyersRes.data ?? []) as CustomersLandingBuyerDbRow[]).entries()) {
          universeRowsByBuyerId.set(
            buyer.id,
            buildBuyerRow(
              buyer,
              index,
              aggregatedSnapshots.get(buyer.id),
              currentKpisByBuyer.get(buyer.id),
              previousKpisByBuyer.get(buyer.id),
              cohortMap.get(buyer.id) ?? '—',
              getActivePriceList(buyer.id),
            ),
          );
        }
      }
    }

    const needsCall = needsCallIds
      .map((buyerId) => universeRowsByBuyerId.get(buyerId))
      .filter((row): row is BuyerRow => Boolean(row))
      .map((row) => ({
        ...row,
        last_order_label: formatLastOrder(row.last_order_at),
      }));
    const topSpenders = topSpenderIds
      .map((buyerId) => universeRowsByBuyerId.get(buyerId))
      .filter((row): row is BuyerRow => Boolean(row));
    const topRisers = topRiserIds
      .map((buyerId) => universeRowsByBuyerId.get(buyerId))
      .filter((row): row is BuyerRow => Boolean(row));

    const filters: LandingFilterMeta = {
      groups: [
        {
          key: 'status',
          label: 'Status',
          options: ['Active', 'Inactive', 'Dormant'].map((value) => ({ value, label: value })),
        },
        {
          key: 'due',
          label: 'Due',
          options: ['Due', 'Overdue'].map((value) => ({ value, label: value })),
        },
      ],
    };

    const payload = {
      period,
      kpis: {
        total: buyerIdsForCallouts.length || buyerCountRes.count || 0,
        cohort_count: cohortSet.size,
        active: activeBuyerCount,
        active_pct: buyerIdsForCallouts.length > 0 ? Math.round((activeBuyerCount / buyerIdsForCallouts.length) * 1000) / 10 : 0,
        spend_mtd: sumCurrentSpend,
        spend_growth_pct: sumPreviousSpend > 0 ? Math.round((((sumCurrentSpend - sumPreviousSpend) / sumPreviousSpend) * 100) * 10) / 10 : 0,
        dormant_over_30d: dormantBuyerCount,
        outstanding_dues: outstandingDues,
        buyers_with_dues: buyersWithDues,
      },
      callouts: {
        needs_call: needsCall,
        top_spenders: topSpenders,
        top_risers: topRisers,
      },
      buyers: pageItems,
      filters,
      nextCursor,
      total: dueParams.length > 0 || statusParams.includes('Dormant')
        ? filteredRows.length
        : buyerCountRes.count ?? pageItems.length,
    };

    customersLandingCache.set(cacheKey, {
      expiresAt: Date.now() + CUSTOMERS_LANDING_CACHE_TTL_MS,
      payload,
    });

    return timedJson(payload);
  } catch (error) {
    console.error('[GET /api/tenant/customers] unexpected error', error);
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
