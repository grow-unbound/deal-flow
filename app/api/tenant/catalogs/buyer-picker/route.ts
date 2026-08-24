import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

type BuyerDbRow = {
  id: string;
  business_name: string;
  geography: { city?: string; state?: string; zone?: string } | null;
};

type NowSummaryRow = {
  buyer_id: string;
  receivable_amount: number | null;
  overdue_amount: number | null;
  last_invoice_date: string | null;
};

type PeriodSummaryRow = {
  buyer_id: string;
  invoice_value: number | null;
};

type CohortRow = {
  id: string;
  name: string;
};

type PickerBuyerRow = {
  id: string;
  business_name: string;
  city: string;
  spend_mtd: number;
  outstanding_due: number;
  last_order_at: string | null;
  ordered_30d: boolean;
  overdue: boolean;
  avatar: {
    initials: string;
    hue: 'teal' | 'ember' | 'cream';
  };
};

type CursorPayload = {
  n: string;
  i: string;
};

const FILTER_OPTIONS_LIMIT = 2_000;
const SELECTED_BUYERS_LIMIT = 250;
const BASE_SCAN_CHUNK = PAGE_SIZE.MAX;

function encodeCursor(row: { business_name: string; id: string }) {
  return Buffer.from(JSON.stringify({ n: row.business_name, i: row.id } satisfies CursorPayload)).toString('base64url');
}

function decodeCursor(cursor: string): { business_name: string; id: string } {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as CursorPayload;
  return { business_name: parsed.n, id: parsed.i };
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'BY'
  );
}

function buyerAvatarHue(index: number): 'teal' | 'ember' | 'cream' {
  return index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream';
}

function formatCity(geography: BuyerDbRow['geography']) {
  const city = typeof geography?.city === 'string' ? geography.city.trim() : '';
  return city || 'Unknown';
}

function currentQuarterStart(): string {
  const now = new Date();
  const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1)).toISOString().slice(0, 10);
}

function thirtyDaysAgoDate(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function buildPickerRows(
  db: any,
  tenantId: string,
  buyers: BuyerDbRow[],
  quarterStart: string,
  cutoff30d: string,
): Promise<PickerBuyerRow[]> {
  const buyerIds = buyers.map((b) => b.id);
  if (buyerIds.length === 0) return [];

  const [nowRes, periodRes] = await Promise.all([
    db
      .schema('app')
      .from('metrics_buyer_now_summary')
      .select('buyer_id, receivable_amount, overdue_amount, last_invoice_date')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .in('buyer_id', buyerIds),
    db
      .schema('app')
      .from('metrics_buyer_period_summary')
      .select('buyer_id, invoice_value')
      .eq('tenant_id', tenantId)
      .eq('grain', 'quarter')
      .eq('period_start', quarterStart)
      .is('deleted_at', null)
      .in('buyer_id', buyerIds),
  ]);

  if (nowRes.error || periodRes.error) {
    throw new Error('Failed to load buyer metrics');
  }

  const nowByBuyer = new Map<string, NowSummaryRow>();
  for (const row of (nowRes.data ?? []) as NowSummaryRow[]) {
    nowByBuyer.set(row.buyer_id, row);
  }

  const periodByBuyer = new Map<string, PeriodSummaryRow>();
  for (const row of (periodRes.data ?? []) as PeriodSummaryRow[]) {
    periodByBuyer.set(row.buyer_id, row);
  }

  return buyers.map((buyer, index) => {
    const now = nowByBuyer.get(buyer.id);
    const period = periodByBuyer.get(buyer.id);
    const lastInvoiceDate = now?.last_invoice_date ?? null;
    return {
      id: buyer.id,
      business_name: buyer.business_name,
      city: formatCity(buyer.geography),
      spend_mtd: Number(period?.invoice_value ?? 0),
      outstanding_due: Number(now?.receivable_amount ?? 0),
      last_order_at: lastInvoiceDate,
      ordered_30d: lastInvoiceDate !== null && lastInvoiceDate >= cutoff30d,
      overdue: Number(now?.overdue_amount ?? 0) > 0,
      avatar: {
        initials: getInitials(buyer.business_name),
        hue: buyerAvatarHue(index),
      },
    } satisfies PickerBuyerRow;
  });
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const db = supabaseAdmin as any;
    const search = (request.nextUrl.searchParams.get('q') ?? '').trim();
    const cityFilters = readArrayParam(request.nextUrl.searchParams, 'city');
    const orderFilters = readArrayParam(request.nextUrl.searchParams, 'orders');
    const dueFilters = readArrayParam(request.nextUrl.searchParams, 'dues');
    const cohortFilters = readArrayParam(request.nextUrl.searchParams, 'cohort');
    const selectedIds = readArrayParam(request.nextUrl.searchParams, 'selected_id').slice(0, SELECTED_BUYERS_LIMIT);
    const cursorParam = request.nextUrl.searchParams.get('cursor');
    const parsedLimit = Number(request.nextUrl.searchParams.get('limit') ?? PAGE_SIZE.COMPOSER);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(Math.floor(parsedLimit), PAGE_SIZE.MAX))
      : PAGE_SIZE.COMPOSER;

    const quarterStart = currentQuarterStart();
    const cutoff30d = thirtyDaysAgoDate();

    const [selectedBuyersRes, cityOptionsRes, cohortRowsRes, cohortMembersRes] = await Promise.all([
      selectedIds.length > 0
        ? db
            .schema('app')
            .from('buyers')
            .select('id, business_name, geography')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .in('id', selectedIds)
            .limit(SELECTED_BUYERS_LIMIT)
        : Promise.resolve({ data: [], error: null }),
      db
        .schema('app')
        .from('buyers')
        .select('geography')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(FILTER_OPTIONS_LIMIT),
      db
        .schema('app')
        .from('cohorts')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      cohortFilters.length > 0
        ? db
            .schema('app')
            .from('cohort_members_active')
            .select('buyer_id')
            .in('cohort_id', cohortFilters)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (selectedBuyersRes.error || cityOptionsRes.error || cohortRowsRes.error || cohortMembersRes.error) {
      console.error('[GET /api/tenant/catalogs/buyer-picker] reference query failed', {
        selectedBuyers: selectedBuyersRes.error,
        cityOptions: cityOptionsRes.error,
        cohorts: cohortRowsRes.error,
        cohortMembers: cohortMembersRes.error,
      });
      return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });
    }

    const selectedBuyerRows = (selectedBuyersRes.data ?? []) as BuyerDbRow[];
    const cohortRows = (cohortRowsRes.data ?? []) as CohortRow[];
    const cohortBuyerIds = cohortFilters.length > 0
      ? Array.from(new Set(((cohortMembersRes.data ?? []) as Array<{ buyer_id: string | null }>)
          .map((row) => row.buyer_id)
          .filter((value): value is string => Boolean(value))))
      : [];

    const wantsOrdered30d = orderFilters.includes('ordered_30d');
    const wantsNoOrders30d = orderFilters.includes('no_orders_30d');
    const wantsOutstandingDue = dueFilters.includes('outstanding_due');
    const wantsOverdue = dueFilters.includes('overdue');
    const cityFilterSet = new Set(cityFilters);

    const filteredBuyers: PickerBuyerRow[] = [];
    let scanCursor = cursorParam ? decodeCursor(cursorParam) : null;
    let nextCursor: string | null = null;
    let hasMoreBaseRows = true;

    if (cohortFilters.length > 0 && cohortBuyerIds.length === 0) {
      hasMoreBaseRows = false;
    }

    while (filteredBuyers.length < limit && hasMoreBaseRows) {
      let buyersQuery = db
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('business_name', { ascending: true })
        .order('id', { ascending: true })
        .limit(BASE_SCAN_CHUNK);

      if (search) {
        buyersQuery = buyersQuery.textSearch('search_vector', search, { type: 'websearch' });
      }
      if (scanCursor) {
        buyersQuery = buyersQuery.or(
          `business_name.gt.${scanCursor.business_name},and(business_name.eq.${scanCursor.business_name},id.gt.${scanCursor.id})`,
        );
      }
      if (cohortBuyerIds.length > 0) {
        buyersQuery = buyersQuery.in('id', cohortBuyerIds);
      }

      const buyersRes = await buyersQuery;
      if (buyersRes.error) {
        console.error('[GET /api/tenant/catalogs/buyer-picker] buyers page query failed', buyersRes.error);
        return NextResponse.json({ error: 'Failed to load buyers' }, { status: 500 });
      }

      const batchRows = (buyersRes.data ?? []) as BuyerDbRow[];
      if (batchRows.length === 0) {
        hasMoreBaseRows = false;
        nextCursor = null;
        break;
      }

      const pickerRows = await buildPickerRows(db, tenantId, batchRows, quarterStart, cutoff30d);

      for (let index = 0; index < pickerRows.length; index += 1) {
        const buyer = pickerRows[index];
        const cityMatches = cityFilterSet.size === 0 || cityFilterSet.has(buyer.city);
        const orderMatches = orderFilters.length === 0
          || (wantsOrdered30d && buyer.ordered_30d)
          || (wantsNoOrders30d && !buyer.ordered_30d);
        const dueMatches = dueFilters.length === 0
          || (wantsOutstandingDue && buyer.outstanding_due > 0)
          || (wantsOverdue && buyer.overdue);
        if (cityMatches && orderMatches && dueMatches) {
          filteredBuyers.push(buyer);
        }

        const scannedBaseRow = batchRows[index];
        const moreRowsInCurrentBatch = index < batchRows.length - 1;
        const moreRowsBeyondBatch = batchRows.length === BASE_SCAN_CHUNK;
        nextCursor = (moreRowsInCurrentBatch || moreRowsBeyondBatch)
          ? encodeCursor({ business_name: scannedBaseRow.business_name, id: scannedBaseRow.id })
          : null;

        if (filteredBuyers.length >= limit) break;
      }

      if (batchRows.length < BASE_SCAN_CHUNK) {
        hasMoreBaseRows = false;
        if (filteredBuyers.length < limit) nextCursor = null;
      } else if (nextCursor) {
        scanCursor = decodeCursor(nextCursor);
      }
    }

    const selectedBuyers = await buildPickerRows(db, tenantId, selectedBuyerRows, quarterStart, cutoff30d);

    const cityCounts = new Map<string, number>();
    for (const row of (cityOptionsRes.data ?? []) as Array<{ geography: BuyerDbRow['geography'] }>) {
      const city = formatCity(row.geography);
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
    }

    const filters: LandingFilterMeta = {
      groups: [
        {
          key: 'city',
          label: 'City',
          options: Array.from(cityCounts.entries())
            .map(([value]) => ({ value, label: value }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        },
        {
          key: 'cohort',
          label: 'Customer Group',
          options: cohortRows.map((cohort) => ({ value: cohort.id, label: cohort.name })),
        },
        {
          key: 'orders',
          label: 'Orders',
          options: [
            { value: 'ordered_30d', label: 'Ordered 30d' },
            { value: 'no_orders_30d', label: 'No orders 30d' },
          ],
        },
        {
          key: 'dues',
          label: 'Dues',
          options: [
            { value: 'outstanding_due', label: 'Outstanding due' },
            { value: 'overdue', label: 'Overdue' },
          ],
        },
      ],
    };

    const response = NextResponse.json({
      buyers: filteredBuyers,
      selected_buyers: selectedBuyers,
      filters,
      nextCursor,
    });
    response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    return response;
  } catch (error) {
    console.error('[GET /api/tenant/catalogs/buyer-picker]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
