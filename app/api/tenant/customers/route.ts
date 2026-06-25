import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { loadBuyerCreditSnapshots } from '@/lib/server/buyer-credit';
import { PAGE_SIZE } from '@/lib/pagination';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

type BuyerRow = {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  phone: string | null;
  gst_treatment: string | null;
  zoho_status: string | null;
  city: string;
  state: string | null;
  cohort: string;
  active_price_list: string | null;
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
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('customers_api'));
    return response;
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

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? String(PAGE_SIZE.SELLER)), PAGE_SIZE.MAX);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const dueParams = readArrayParam(req.nextUrl.searchParams, 'due');
    const cityParams = readArrayParam(req.nextUrl.searchParams, 'city');
    const stateParams = readArrayParam(req.nextUrl.searchParams, 'state');
    const cacheKey = [
      tenantId,
      limit,
      cursorParam ?? '',
      search,
      statusParams.join('|'),
      dueParams.join('|'),
      cityParams.join('|'),
      stateParams.join('|'),
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

    const { data: buyers, error: buyersError } = await db
      .schema('app')
      .from('buyers')
      .select('id, business_name, tier, phone, gst_treatment, status, credit_limit, is_active, geography, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('business_name', { ascending: true })
      .order('id', { ascending: true });

    if (buyersError) {
      return timedJson({ error: 'Failed to fetch buyers' }, { status: 500 });
    }

    const buyerRows = buyers ?? [];
    const buyerIds = buyerRows.map((b: { id: string }) => b.id);
    const buyerIdSet = new Set(buyerIds);

    if (buyerRows.length === 0) {
      const emptyPayload = {
        period,
        kpis: {
          total: 0,
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
        total: 0,
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
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('placed_at', period.current_start)
        .lt('placed_at', period.current_end_exclusive),
      db
        .schema('app')
        .from('orders')
        .select('id, buyer_id, total_amount, placed_at, status, deleted_at')
        .eq('tenant_id', tenantId)
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
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('placed_at', ninetyDaysAgoIso)
        .order('placed_at', { ascending: false }),
      db
        .schema('app')
        .from('cohort_members')
        .select('buyer_id, cohort:cohorts(name, deleted_at)'),
      db
        .schema('app')
        .from('invoices')
        .select('buyer_id, status, outstanding_balance, deleted_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('status', ['sent', 'overdue']),
      db
        .schema('app')
        .from('price_list_assignments')
        .select('target_id, price_list_id, created_at')
        .eq('target_type', 'buyer')
        .in('target_id', buyerIds)
        .is('deleted_at', null)
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
      (invoicesRes.error && !invoicesTableMissing) ||
      priceListAssignmentsRes.error
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

    const priceListIds = Array.from(new Set((priceListAssignmentsRes.data ?? []).map((row: any) => row.price_list_id).filter(Boolean)));
    const { data: priceLists } = priceListIds.length > 0
      ? await db
          .schema('app')
          .from('price_lists')
          .select('id, name')
          .in('id', priceListIds)
          .is('deleted_at', null)
      : { data: [] as Array<{ id: string; name: string }> };
    const priceListNameById = new Map<string, string>((priceLists ?? []).map((row: any) => [row.id, row.name] as const));
    const activePriceListByBuyerId = new Map<string, string>();
    for (const row of (priceListAssignmentsRes.data ?? []) as Array<{ target_id: string | null; price_list_id: string }>) {
      if (!row.target_id || activePriceListByBuyerId.has(row.target_id)) continue;
      activePriceListByBuyerId.set(row.target_id, priceListNameById.get(row.price_list_id) ?? 'Assigned');
    }

    const mtdOrders = (mtdOrdersRes.data ?? []).filter((order: { buyer_id: string }) => buyerIdSet.has(order.buyer_id));
    const prevOrders = (prevOrdersRes.data ?? []).filter((order: { buyer_id: string }) => buyerIdSet.has(order.buyer_id));
    const allOrders = (recentOrdersRes.data ?? []).filter((order: { buyer_id: string }) => buyerIdSet.has(order.buyer_id));
    const cohortMembers = (cohortMembersRes.data ?? []).filter((row: { buyer_id: string }) => buyerIdSet.has(row.buyer_id));
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

    let creditSnapshots = new Map<string, { outstanding_dues: number }>();
    try {
      creditSnapshots = await loadBuyerCreditSnapshots(supabaseAdmin as any, {
        tenantId,
        buyerIds: buyerRows.map((buyer: any) => buyer.id),
        creditLimitByBuyerId: new Map(
          buyerRows.map((buyer: any) => [buyer.id, Number(buyer.credit_limit ?? 0)]),
        ),
      });
    } catch (error) {
      console.warn('[GET /api/tenant/customers] credit snapshot enrichment failed; defaulting dues to zero.', {
        error,
      });
    }

    const cohortMap = new Map<string, string>();
    const cohortSet = new Set<string>();
    for (const row of cohortMembers) {
      const cohortName = row.cohort?.name;
      const cohortDeletedAt = row.cohort?.deleted_at;
      if (!cohortName || cohortDeletedAt) continue;
      cohortSet.add(cohortName);
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
        city: buyer.geography?.city ?? 'Unknown',
        state: buyer.geography?.state ?? null,
        cohort: cohortMap.get(buyer.id) ?? '—',
        active_price_list: activePriceListByBuyerId.get(buyer.id) ?? null,
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
      };
    });

    const filteredRows = rows
      .filter((row) => statusParams.length === 0 || statusParams.includes(row.status.label))
      .filter((row) => {
        if (dueParams.length === 0) return true;
        return dueParams.some((value) => {
          if (value === 'Due') return row.dues > 0;
          if (value === 'Overdue') return overdueBuyerIds.has(row.id);
          return false;
        });
      })
      .filter((row) => cityParams.length === 0 || cityParams.includes(row.city))
      .filter((row) => stateParams.length === 0 || (row.state ? stateParams.includes(row.state) : false))
      .filter((row) =>
        search
          ? [row.business_name, row.phone ?? '', row.city, row.cohort, row.active_price_list ?? '', row.status.label, row.state ?? '', row.gst_treatment ?? '', row.zoho_status ?? ''].some((value) =>
              value.toLowerCase().includes(search),
            )
          : true,
      );

    const pagedRows = cursorParam
      ? (() => {
          const cursor = decodeCursor(cursorParam);
          const index = filteredRows.findIndex(
            (row) => row.business_name > cursor.business_name || (row.business_name === cursor.business_name && row.id > cursor.id),
          );
          return index >= 0 ? filteredRows.slice(index) : [];
        })()
      : filteredRows;

    const pageItems = pagedRows.slice(0, limit);
    const lastItem = pageItems.at(-1);
    const nextCursor = pagedRows.length > limit && lastItem ? encodeCursor({ business_name: lastItem.business_name, id: lastItem.id }) : null;

    const total = filteredRows.length;
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
          options: Array.from(new Set(rows.map((row) => row.status.label))).sort().map((value) => ({ value, label: value })),
        },
        {
          key: 'due',
          label: 'Due',
          options: ['Due', 'Overdue'].map((value) => ({ value, label: value })),
        },
        {
          key: 'city',
          label: 'City',
          options: Array.from(new Set(rows.map((row) => row.city))).sort().map((value) => ({ value, label: value })),
        },
        {
          key: 'state',
          label: 'State',
          options: Array.from(new Set(rows.map((row) => row.state).filter(Boolean) as string[])).sort().map((value) => ({ value, label: value })),
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
