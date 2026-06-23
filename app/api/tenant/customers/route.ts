import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { loadBuyerCreditSnapshots } from '@/lib/server/buyer-credit';
import { PAGE_SIZE } from '@/lib/pagination';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

type BuyerRow = {
  id: string;
  business_name: string;
  tier: 'A' | 'B' | 'C' | null;
  city: string;
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
    const cacheKey = [
      tenantId,
      limit,
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
      .select('id, business_name, tier, credit_limit, is_active, geography, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(limit);

    if (buyersError) {
      return timedJson({ error: 'Failed to fetch buyers' }, { status: 500 });
    }

    const buyerRows = buyers ?? [];
    const buyerIds = buyerRows.map((b: { id: string }) => b.id);

    // last_order_at is derived from the 90-day window orders query below.
    // We intentionally avoid an unbounded "all orders ever" query — it would scan the
    // entire orders table for every page load. 90 days covers all practical dormancy
    // thresholds (the dormancy check uses a 30-day cutoff).
    const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [mtdOrdersRes, prevOrdersRes, recentOrdersRes, cohortMembersRes, invoicesRes] = await Promise.all([
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
      buyerIds.length
        ? db
            .schema('app')
            .from('orders')
            .select('id, buyer_id, placed_at, status, deleted_at')
            .eq('tenant_id', tenantId)
            .in('buyer_id', buyerIds)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .gte('placed_at', ninetyDaysAgoIso)
            .order('placed_at', { ascending: false })
        : Promise.resolve({ data: [] as any[], error: null }),
      buyerIds.length
        ? db
            .schema('app')
            .from('cohort_members')
            .select('buyer_id, cohort:cohorts(name, deleted_at)')
            .in('buyer_id', buyerIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      buyerIds.length
        ? db
            .schema('app')
            .from('invoices')
            .select('buyer_id, status, outstanding_balance, deleted_at')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .in('buyer_id', buyerIds)
            .in('status', ['sent', 'overdue'])
        : Promise.resolve({ data: [] as any[], error: null }),
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
      });
      return timedJson({ error: 'Failed to fetch customers landing data' }, { status: 500 });
    }

    const mtdOrders = mtdOrdersRes.data ?? [];
    const prevOrders = prevOrdersRes.data ?? [];
    const allOrders = recentOrdersRes.data ?? [];
    const cohortMembers = cohortMembersRes.data ?? [];
    const invoices = invoicesTableMissing ? [] : invoicesRes.data ?? [];

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

    const creditSnapshots = await loadBuyerCreditSnapshots(supabaseAdmin as any, {
      tenantId,
      buyerIds: buyerRows.map((buyer: any) => buyer.id),
      creditLimitByBuyerId: new Map(
        buyerRows.map((buyer: any) => [buyer.id, Number(buyer.credit_limit ?? 0)]),
      ),
    });

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
        city: buyer.geography?.city ?? 'Unknown',
        cohort: cohortMap.get(buyer.id) ?? '—',
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

    const total = rows.length;
    const active = rows.filter((row) => row.orders_mtd > 0).length;
    const spend_mtd = rows.reduce((sum, row) => sum + row.spend_mtd, 0);
    const spend_prev_mtd = rows.reduce((sum, row) => sum + row.spend_prev_mtd, 0);
    const spend_growth_pct = spend_prev_mtd > 0 ? Math.round(((spend_mtd - spend_prev_mtd) / spend_prev_mtd) * 100) : 0;
    const dormant_over_30d = rows.filter((row) => !row.last_order_at || row.last_order_at < dormantCutoffIso).length;
    const outstanding_dues = rows.reduce((sum, row) => sum + row.dues, 0);
    const buyers_with_dues = rows.filter((row) => row.dues > 0).length;

    const needsCall = rows
      .filter((row) => row.status.tone === 'warning' || row.status.tone === 'danger' || row.growth_pct < 0 || row.dues > 80000)
      .slice(0, 3)
      .map((row) => ({
        ...row,
        last_order_label: formatLastOrder(row.last_order_at),
      }));

    const topSpenders = [...rows].sort((a, b) => b.spend_mtd - a.spend_mtd).slice(0, 2);
    const topRisers = [...rows].filter((row) => row.growth_pct > 0).sort((a, b) => b.growth_pct - a.growth_pct).slice(0, 2);

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
      buyers: rows,
    };

    customersLandingCache.set(cacheKey, {
      expiresAt: Date.now() + CUSTOMERS_LANDING_CACHE_TTL_MS,
      payload,
    });

    return timedJson(payload);
  } catch {
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
