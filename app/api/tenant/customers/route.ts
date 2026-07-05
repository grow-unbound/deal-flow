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
  deleted_at: string | null;
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

    const buildBuyerQuery = (mode: 'rows' | 'count') => {
      let query = db
        .schema('app')
        .from('buyers')
        .select(
          mode === 'count'
            ? 'id'
            : 'id, business_name, tier, phone, gst_treatment, status, credit_limit, is_active, geography, deleted_at, whatsapp_opt_out_at',
          mode === 'count' ? { count: 'exact', head: true } : undefined,
        )
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('business_name', { ascending: true })
        .order('id', { ascending: true });

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

    const [buyerRowsRes, buyerCountRes, customersSnapshotRes] = await Promise.all([
      buildBuyerQuery('rows'),
      buildBuyerQuery('count'),
      db
        .schema('app')
        .from('customers_snapshot')
        .select('total_count, active_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    if (buyerRowsRes.error || buyerCountRes.error) {
      console.error('[GET /api/tenant/customers] buyers query failure', buyerRowsRes.error || buyerCountRes.error);
      return timedJson({ error: 'Failed to fetch customers landing data' }, { status: 500 });
    }

    const fetchedBuyerRows = (buyerRowsRes.data ?? []) as CustomersLandingBuyerDbRow[];
    const hasNextPage = fetchedBuyerRows.length > limit;
    const buyerRows = hasNextPage ? fetchedBuyerRows.slice(0, limit) : fetchedBuyerRows;
    const buyerIds = buyerRows.map((b) => b.id);
    const buyerIdSet = new Set(buyerIds);

    if (buyerRows.length === 0) {
      const emptyPayload = {
        period,
        kpis: {
          total: buyerCountRes.count ?? customersSnapshotRes.data?.total_count ?? 0,
          cohort_count: 0,
          active: 0,
          active_pct: 0,
          spend_mtd: 0,
          spend_growth_pct: 0,
          dormant_over_30d: 0,
          outstanding_dues: 0,
          buyers_with_dues: 0,
        },
        callouts: {
          needs_call: [],
          top_spenders: [],
          top_risers: [],
        },
        buyers: [],
        nextCursor: null,
        total: buyerCountRes.count ?? customersSnapshotRes.data?.total_count ?? 0,
      };

      customersLandingCache.set(cacheKey, {
        expiresAt: Date.now() + CUSTOMERS_LANDING_CACHE_TTL_MS,
        payload: emptyPayload,
      });

      return timedJson(emptyPayload);
    }

    // last_order_at is derived from the 90-day window orders query below.
    // We intentionally avoid an unbounded "all orders ever" query — it would scan the
    // entire orders table for every page load. 90 days covers all practical dormancy
    // thresholds (the dormancy check uses a 30-day cutoff).
    const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [mtdOrdersRes, prevOrdersRes, recentOrdersRes, cohortMembersRes, invoicesRes, priceListAssignmentsRes] = await Promise.all([
      db
        .schema('app')
        .from('orders')
        .select('id, buyer_id, total_amount, placed_at, status, deleted_at')
        .eq('tenant_id', tenantId)
        .in('buyer_id', buyerIds)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('placed_at', period.current_start)
        .lt('placed_at', period.current_end_exclusive),
      db
        .schema('app')
        .from('orders')
        .select('id, buyer_id, total_amount, placed_at, status, deleted_at')
        .eq('tenant_id', tenantId)
        .in('buyer_id', buyerIds)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('placed_at', period.previous_start)
        .lt('placed_at', period.previous_end_exclusive),
      // Bounded to 90 days — enough to determine last_order_at and dormancy (30-day threshold).
      db
        .schema('app')
        .from('orders')
        .select('id, buyer_id, placed_at, status, deleted_at')
        .eq('tenant_id', tenantId)
        .in('buyer_id', buyerIds)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('placed_at', ninetyDaysAgoIso)
        .order('placed_at', { ascending: false }),
      db
        .schema('app')
        .from('cohort_members')
        .select('buyer_id, cohort_id, cohort:cohorts(id, name, deleted_at)')
        .in('buyer_id', buyerIds),
      db
        .schema('app')
        .from('invoices')
        .select('buyer_id, status, outstanding_balance, deleted_at')
        .eq('tenant_id', tenantId)
        .in('buyer_id', buyerIds)
        .is('deleted_at', null)
        .in('status', ['sent', 'overdue']),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('target_id, target_type, price_list_id, created_at, price_lists!inner(id, name, priority, tenant_id, deleted_at)')
        .is('deleted_at', null)
        .eq('price_lists.tenant_id', tenantId)
        .is('price_lists.deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);

    const invoicesTableMissing =
      invoicesRes.error?.code === 'PGRST205' ||
      invoicesRes.error?.code === '42P01' ||
      (invoicesRes.error?.message ?? '').toLowerCase().includes('invoices');
    if (invoicesTableMissing) {
      console.warn('[GET /api/tenant/customers] app.invoices not available yet; defaulting dues to zero.');
    }

    if (
      mtdOrdersRes.error ||
      prevOrdersRes.error ||
      recentOrdersRes.error ||
      cohortMembersRes.error ||
      (invoicesRes.error && !invoicesTableMissing)
    ) {
      console.error('[GET /api/tenant/customers] query failure', {
        mtd: mtdOrdersRes.error,
        prev: prevOrdersRes.error,
        recent: recentOrdersRes.error,
        cohorts: cohortMembersRes.error,
        invoices: invoicesRes.error,
        priceListAssignments: priceListAssignmentsRes.error,
      });
      return timedJson({ error: 'Failed to fetch customers landing data' }, { status: 500 });
    }

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

    const mtdOrders = (mtdOrdersRes.data ?? []).filter((order: { buyer_id: string }) => buyerIdSet.has(order.buyer_id));
    const prevOrders = (prevOrdersRes.data ?? []).filter((order: { buyer_id: string }) => buyerIdSet.has(order.buyer_id));
    const allOrders = (recentOrdersRes.data ?? []).filter((order: { buyer_id: string }) => buyerIdSet.has(order.buyer_id));
    const cohortMembers = (cohortMembersRes.data ?? []) as CohortMembershipRow[];
    const invoices = invoicesTableMissing ? [] : (invoicesRes.data ?? []).filter((invoice: { buyer_id: string }) => buyerIdSet.has(invoice.buyer_id));

    const spendMtdByBuyer = new Map<string, number>();
    const spendPrevByBuyer = new Map<string, number>();
    const ordersMtdByBuyer = new Map<string, number>();
    const lastOrderByBuyer = new Map<string, string>();

    for (const order of mtdOrders) {
      spendMtdByBuyer.set(order.buyer_id, (spendMtdByBuyer.get(order.buyer_id) ?? 0) + Number(order.total_amount ?? 0));
      ordersMtdByBuyer.set(order.buyer_id, (ordersMtdByBuyer.get(order.buyer_id) ?? 0) + 1);
    }

    for (const order of prevOrders) {
      spendPrevByBuyer.set(order.buyer_id, (spendPrevByBuyer.get(order.buyer_id) ?? 0) + Number(order.total_amount ?? 0));
    }

    for (const order of allOrders) {
      if (!lastOrderByBuyer.has(order.buyer_id) && order.placed_at) {
        lastOrderByBuyer.set(order.buyer_id, order.placed_at);
      }
    }

    const creditSnapshots = new Map<string, { outstanding_dues: number }>();
    for (const buyer of buyerRows as Array<{ id: string; credit_limit: number | null }>) {
      creditSnapshots.set(buyer.id, {
        outstanding_dues: 0,
      });
    }
    for (const invoice of invoices as Array<{ buyer_id: string; outstanding_balance: number | null }>) {
      const snapshot = creditSnapshots.get(invoice.buyer_id);
      if (!snapshot) continue;
      snapshot.outstanding_dues += Number(invoice.outstanding_balance ?? 0);
    }

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

    const overdueBuyerIds = new Set(
      invoices
        .filter((invoice: any) => invoice.status === 'overdue' && Number(invoice.outstanding_balance ?? 0) > 0)
        .map((invoice: any) => invoice.buyer_id),
    );
    const rows: BuyerRow[] = buyerRows.map((buyer: any, index: number) => {
      const spend_mtd = spendMtdByBuyer.get(buyer.id) ?? 0;
      const spend_prev_mtd = spendPrevByBuyer.get(buyer.id) ?? 0;
      const growth_pct = spend_prev_mtd > 0 ? Math.round(((spend_mtd - spend_prev_mtd) / spend_prev_mtd) * 100) : spend_mtd > 0 ? 100 : 0;
      const orders_mtd = ordersMtdByBuyer.get(buyer.id) ?? 0;
      const last_order_at = lastOrderByBuyer.get(buyer.id) ?? null;
      const credit_limit = Number(buyer.credit_limit ?? 0);
      const dues = creditSnapshots.get(buyer.id)?.outstanding_dues ?? 0;
      const credit_used = dues;
      const dormant = !last_order_at || last_order_at < dormantCutoffIso;
      const directPriceList = buyerDirectPriceListByBuyerId.get(buyer.id) ?? null;
      let cohortPriceList: { name: string; source: 'cohort'; cohort_name?: string | null } | null = null;
      if (!directPriceList) {
        const cohorts = buyerCohortsByBuyerId.get(buyer.id) ?? [];
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
        if (best) {
          cohortPriceList = { name: best.name, source: 'cohort', cohort_name: best.cohort_name };
        }
      }

      let status: BuyerRow['status'] = { label: 'Healthy', tone: 'success' };
      if (dues > 80000 || growth_pct < 0) status = { label: 'Needs follow-up', tone: 'warning' };
      if (dormant) status = { label: 'Dormant', tone: 'danger' };

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
        cohort: cohortMap.get(buyer.id) ?? '—',
        active_price_list: directPriceList ?? cohortPriceList,
        spend_mtd,
        spend_prev_mtd,
        growth_pct,
        orders_mtd,
        last_order_at,
        credit_limit,
        credit_used,
        dues,
        status,
        avatar: {
          initials: getInitials(buyer.business_name),
          hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
        },
        whatsapp_opted_out: Boolean(buyer.whatsapp_opt_out_at),
      };
    });

    const filteredRows = rows
      .filter((row) => {
        if (statusParams.length === 0) return true;
        const dormant = !row.last_order_at || row.last_order_at < dormantCutoffIso;
        return statusParams.some((value) => {
          if (value === 'Active') return row.is_active && !dormant;
          if (value === 'Inactive') return !row.is_active;
          if (value === 'Dormant') return row.is_active && dormant;
          return false;
        });
      })
      .filter((row) => {
        if (dueParams.length === 0) return true;
        return dueParams.some((value) => {
          if (value === 'Due') return row.dues > 0;
          if (value === 'Overdue') return overdueBuyerIds.has(row.id);
          return false;
        });
      })
      .filter((row) =>
        search
          ? [
              row.business_name,
              row.phone ?? '',
              row.city,
              row.cohort,
              row.active_price_list?.name ?? '',
              row.active_price_list?.cohort_name ?? '',
              row.status.label,
              row.state ?? '',
              row.gst_treatment ?? '',
              row.zoho_status ?? '',
            ].some((value) =>
              value.toLowerCase().includes(search),
            )
          : true,
      );

    const pageItems = filteredRows.slice(0, limit);
    const lastItem = pageItems.at(-1);
    const nextCursor = hasNextPage && lastItem ? encodeCursor({ business_name: lastItem.business_name, id: lastItem.id }) : null;

    const total = dueParams.length > 0 || statusParams.includes('Dormant')
      ? filteredRows.length
      : buyerCountRes.count ?? customersSnapshotRes.data?.total_count ?? filteredRows.length;
    const active = filteredRows.filter((row) => row.orders_mtd > 0).length;
    const spend_mtd = filteredRows.reduce((sum, row) => sum + row.spend_mtd, 0);
    const spend_prev_mtd = filteredRows.reduce((sum, row) => sum + row.spend_prev_mtd, 0);
    const spend_growth_pct = spend_prev_mtd > 0 ? Math.round(((spend_mtd - spend_prev_mtd) / spend_prev_mtd) * 100) : 0;
    const dormant_over_30d = filteredRows.filter((row) => !row.last_order_at || row.last_order_at < dormantCutoffIso).length;
    const outstanding_dues = filteredRows.reduce((sum, row) => sum + row.dues, 0);
    const buyers_with_dues = filteredRows.filter((row) => row.dues > 0).length;

    const needsCall = filteredRows
      .filter((row) => row.status.tone === 'warning' || row.status.tone === 'danger' || row.growth_pct < 0 || row.dues > 80000)
      .slice(0, 3)
      .map((row) => ({
        ...row,
        last_order_label: formatLastOrder(row.last_order_at),
      }));

    const topSpenders = [...filteredRows].sort((a, b) => b.spend_mtd - a.spend_mtd).slice(0, 2);
    const topRisers = [...filteredRows].filter((row) => row.growth_pct > 0).sort((a, b) => b.growth_pct - a.growth_pct).slice(0, 2);

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
        total,
        cohort_count: cohortSet.size,
        active,
        active_pct: total > 0 ? Math.round((active / total) * 1000) / 10 : 0,
        spend_mtd,
        spend_growth_pct,
        dormant_over_30d,
        outstanding_dues,
        buyers_with_dues,
      },
      callouts: {
        needs_call: needsCall,
        top_spenders: topSpenders,
        top_risers: topRisers,
      },
      buyers: pageItems,
      filters,
      nextCursor,
      total,
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
