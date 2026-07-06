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

type OrderDbRow = {
  buyer_id: string;
  total_amount: number | null;
  placed_at: string | null;
};

type InvoiceDbRow = {
  buyer_id: string;
  status: string | null;
  outstanding_balance: number | null;
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

function isInvoicesTableMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === 'PGRST205'
    || error.code === '42P01'
    || (error.message ?? '').toLowerCase().includes('invoices');
}

async function buildPickerRows(db: any, tenantId: string, buyers: BuyerDbRow[], monthStart: string, thirtyDaysAgo: string) {
  const buyerIds = buyers.map((buyer) => buyer.id);
  if (buyerIds.length === 0) return [];

  const [mtdOrdersRes, recentOrdersRes, invoicesRes] = await Promise.all([
    db
      .schema('app')
      .from('orders')
      .select('buyer_id, total_amount')
      .eq('tenant_id', tenantId)
      .in('buyer_id', buyerIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('placed_at', monthStart),
    db
      .schema('app')
      .from('orders')
      .select('buyer_id, placed_at')
      .eq('tenant_id', tenantId)
      .in('buyer_id', buyerIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('placed_at', thirtyDaysAgo)
      .order('placed_at', { ascending: false }),
    db
      .schema('app')
      .from('invoices')
      .select('buyer_id, status, outstanding_balance')
      .eq('tenant_id', tenantId)
      .in('buyer_id', buyerIds)
      .is('deleted_at', null)
      .in('status', ['sent', 'overdue']),
  ]);

  const invoicesMissing = isInvoicesTableMissing(invoicesRes.error);
  if (mtdOrdersRes.error || recentOrdersRes.error || (invoicesRes.error && !invoicesMissing)) {
    throw new Error('Failed to load buyer metrics');
  }

  const spendMtdByBuyer = new Map<string, number>();
  for (const row of (mtdOrdersRes.data ?? []) as OrderDbRow[]) {
    spendMtdByBuyer.set(row.buyer_id, (spendMtdByBuyer.get(row.buyer_id) ?? 0) + Number(row.total_amount ?? 0));
  }

  const orders30dCountByBuyer = new Map<string, number>();
  const lastOrderAtByBuyer = new Map<string, string>();
  for (const row of (recentOrdersRes.data ?? []) as OrderDbRow[]) {
    orders30dCountByBuyer.set(row.buyer_id, (orders30dCountByBuyer.get(row.buyer_id) ?? 0) + 1);
    if (row.placed_at && !lastOrderAtByBuyer.has(row.buyer_id)) {
      lastOrderAtByBuyer.set(row.buyer_id, row.placed_at);
    }
  }

  const outstandingDueByBuyer = new Map<string, number>();
  const overdueBuyerIds = new Set<string>();
  for (const row of ((invoicesMissing ? [] : invoicesRes.data) ?? []) as InvoiceDbRow[]) {
    const outstanding = Number(row.outstanding_balance ?? 0);
    if (outstanding <= 0) continue;
    outstandingDueByBuyer.set(row.buyer_id, (outstandingDueByBuyer.get(row.buyer_id) ?? 0) + outstanding);
    if (row.status === 'overdue') overdueBuyerIds.add(row.buyer_id);
  }

  return buyers.map((buyer, index) => ({
    id: buyer.id,
    business_name: buyer.business_name,
    city: formatCity(buyer.geography),
    spend_mtd: spendMtdByBuyer.get(buyer.id) ?? 0,
    outstanding_due: outstandingDueByBuyer.get(buyer.id) ?? 0,
    last_order_at: lastOrderAtByBuyer.get(buyer.id) ?? null,
    ordered_30d: (orders30dCountByBuyer.get(buyer.id) ?? 0) > 0,
    overdue: overdueBuyerIds.has(buyer.id),
    avatar: {
      initials: getInitials(buyer.business_name),
      hue: buyerAvatarHue(index),
    },
  } satisfies PickerBuyerRow));
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

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

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
            .from('cohort_members')
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

      const pickerRows = await buildPickerRows(db, tenantId, batchRows, monthStart, thirtyDaysAgo);

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

    const selectedBuyers = await buildPickerRows(db, tenantId, selectedBuyerRows, monthStart, thirtyDaysAgo);

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
