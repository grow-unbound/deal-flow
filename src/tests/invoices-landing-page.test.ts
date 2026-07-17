import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getAuthUserDisplayNameMapMock = vi.fn();
const invoiceKpiCallState = { count: 0 };

interface InvoiceDbRow {
  id: string;
  location_id: string | null;
  invoice_number: string;
  buyer_id: string;
  order_id: string | null;
  estimate_id: string | null;
  status: string;
  total_amount: number;
  outstanding_balance: number;
  invoice_date: string;
  due_date: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface QueryState {
  buyers: Array<{ id: string; business_name: string; geography: Record<string, unknown> | null }>;
  invoices: InvoiceDbRow[];
  invoiceItems: Array<{ invoice_id: string }>;
  orders: Array<{ id: string; order_number: string }>;
  estimates: Array<{ id: string; estimate_number: string | null }>;
  currentKpis: Array<Record<string, unknown>>;
  previousKpis: Array<Record<string, unknown>>;
}

const queryState: QueryState = {
  buyers: [],
  invoices: [],
  invoiceItems: [],
  orders: [],
  estimates: [],
  currentKpis: [],
  previousKpis: [],
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/auth-user-directory', () => ({
  getAuthUserDisplayNameMap: (...args: unknown[]) => getAuthUserDisplayNameMapMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  applySellerLocationScope: <T extends { in?: (column: string, values: string[]) => T }>(
    query: T,
    claims: { location_ids?: string[] | null; role?: string | null },
  ) => {
    if (claims.role === 'seller_assistant' && claims.location_ids?.length && query.in) {
      return query.in('location_id', claims.location_ids);
    }
    return query;
  },
  loadAccessibleSellerLocations: vi.fn(async (_db: unknown, _tenantId: string, claims: { location_ids?: string[] | null }) => {
    const all = [
      { id: 'loc-1', name: 'North Hub' },
      { id: 'loc-2', name: 'South Hub' },
    ];
    return claims.location_ids?.length ? all.filter((row) => claims.location_ids?.includes(row.id)) : all;
  }),
  resolveDefaultSellerLocationId: vi.fn(() => 'loc-1'),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: vi.fn().mockResolvedValue({ create_invoices: true }),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private table: string;
    private conditions: Array<{ kind: 'eq' | 'in' | 'gte' | 'lt' | 'gt'; column: string; value: unknown }> = [];
    private orderBy: Array<{ column: string; ascending: boolean }> = [];
    private take: number | null = null;
    private head = false;
    private periodFilter:
      | { primary: string; fallback: string; start: number; endExclusive: number }
      | null = null;

    constructor(table: string) {
      this.table = table;
    }

    select(_columns?: string, options?: { head?: boolean }) {
      this.head = Boolean(options?.head);
      return this;
    }
    eq(column: string, value: unknown) {
      this.conditions.push({ kind: 'eq', column, value });
      return this;
    }
    is() {
      return this;
    }
    in() {
      this.conditions.push({ kind: 'in', column: arguments[0] as string, value: arguments[1] });
      return this;
    }
    gte(column: string, value: unknown) {
      this.conditions.push({ kind: 'gte', column, value });
      return this;
    }
    lt(column: string, value: unknown) {
      this.conditions.push({ kind: 'lt', column, value });
      return this;
    }
    gt(column: string, value: unknown) {
      this.conditions.push({ kind: 'gt', column, value });
      return this;
    }
    order() {
      this.orderBy.push({
        column: arguments[0] as string,
        ascending: (arguments[1] as { ascending?: boolean } | undefined)?.ascending ?? true,
      });
      return this;
    }
    limit(value: number) {
      this.take = value;
      return this;
    }
    ilike() {
      return this;
    }
    or(filter: string) {
      const periodMatch = filter.match(
        /and\(invoice_date\.gte\.([^,]+),invoice_date\.lt\.([^)]+)\),and\(invoice_date\.is\.null,created_at\.gte\.([^,]+),created_at\.lt\.([^)]+)\)/,
      );
      if (periodMatch) {
        this.periodFilter = {
          primary: 'invoice_date',
          fallback: 'created_at',
          start: new Date(periodMatch[1]).getTime(),
          endExclusive: new Date(periodMatch[2]).getTime(),
        };
      }
      return this;
    }

    then(resolve: (value: { data: unknown; error: null; count?: number }) => void) {
      const applyFilters = (rows: Array<Record<string, unknown>>) => {
        let result = [...rows];
        if (this.periodFilter) {
          result = result.filter((row) => {
            const primaryValue = row[this.periodFilter!.primary];
            const fallbackValue = row[this.periodFilter!.fallback];
            const rawValue = typeof primaryValue === 'string' ? primaryValue : fallbackValue;
            if (typeof rawValue !== 'string') return false;
            const time = new Date(rawValue).getTime();
            return time >= this.periodFilter!.start && time < this.periodFilter!.endExclusive;
          });
        }
        for (const condition of this.conditions) {
          if (condition.kind === 'eq') {
            result = result.filter((row) => !(condition.column in row) || row[condition.column] === condition.value);
            continue;
          }
          if (condition.kind === 'gte' || condition.kind === 'lt') {
            const threshold = new Date(String(condition.value)).getTime();
            result = result.filter((row) => {
              const rowValue = row[condition.column];
              if (typeof rowValue !== 'string') return false;
              const time = new Date(rowValue).getTime();
              return condition.kind === 'gte' ? time >= threshold : time < threshold;
            });
            continue;
          }
          if (condition.kind === 'gt') {
            result = result.filter((row) => Number(row[condition.column] ?? 0) > Number(condition.value ?? 0));
            continue;
          }
          const values = Array.isArray(condition.value) ? condition.value : [];
          result = result.filter((row) => values.includes(row[condition.column]));
        }
        if (this.orderBy.length > 0) {
          result.sort((a, b) => {
            for (const order of this.orderBy) {
              const av = a[order.column];
              const bv = b[order.column];
              if (typeof av === 'string' && typeof bv === 'string') {
                const avTime = new Date(av).getTime();
                const bvTime = new Date(bv).getTime();
                if (!Number.isNaN(avTime) && !Number.isNaN(bvTime) && avTime !== bvTime) {
                  const delta = avTime - bvTime;
                  return order.ascending ? delta : -delta;
                }
                if (av !== bv) {
                  const delta = av.localeCompare(bv);
                  return order.ascending ? delta : -delta;
                }
                continue;
              }
              const delta = Number(av ?? 0) - Number(bv ?? 0);
              if (delta !== 0) {
                return order.ascending ? delta : -delta;
              }
            }
            return 0;
          });
        }
        if (this.take != null) {
          result = result.slice(0, this.take);
        }
        return result;
      };

      const finish = (rows: Array<Record<string, unknown>>) => {
        const filtered = applyFilters(rows);
        return resolve({
          data: this.head ? null : filtered,
          error: null,
          count: this.head ? filtered.length : undefined,
        });
      };

      if (this.table === 'buyers') return finish(queryState.buyers as Array<Record<string, unknown>>);
      if (this.table === 'invoices') return finish(queryState.invoices as Array<Record<string, unknown>>);
      if (this.table === 'invoice_items') return finish(queryState.invoiceItems as Array<Record<string, unknown>>);
      if (this.table === 'orders') return finish(queryState.orders as Array<Record<string, unknown>>);
      if (this.table === 'estimates') return finish(queryState.estimates as Array<Record<string, unknown>>);
      if (this.table === 'kpi_invoices_current') return finish(queryState.currentKpis as Array<Record<string, unknown>>);
      if (this.table === 'kpi_invoices_previous') return finish(queryState.previousKpis as Array<Record<string, unknown>>);
      return finish([]);
    }
  }

  const from = vi.fn((table: string) => {
    if (table === 'kpi_invoices_daily') {
      invoiceKpiCallState.count += 1;
      return new QueryMock(invoiceKpiCallState.count === 1 ? 'kpi_invoices_current' : 'kpi_invoices_previous');
    }
    return new QueryMock(table);
  });
  const sum = (rows: Array<Record<string, unknown>>, key: string) =>
    rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const scopedRows = (rows: Array<Record<string, unknown>>, args?: { p_location_ids?: string[] | null }) => {
    const locationIds = args?.p_location_ids ?? null;
    return locationIds?.length
      ? rows.filter((row) => row.scope === 'location' && locationIds.includes(String(row.location_id)))
      : rows.filter((row) => row.scope === 'tenant');
  };
  const rpc = vi.fn(async (name: string, args?: { p_location_ids?: string[] | null }) => {
    if (name !== 'metrics_v2_transaction_landing') return { data: null, error: null };
    const current = scopedRows(queryState.currentKpis, args);
    const previous = scopedRows(queryState.previousKpis, args);
    const invoices = sum(current, 'invoices_count');
    const previousInvoices = sum(previous, 'invoices_count');
    const gmv = sum(current, 'gmv');
    return {
      data: {
        kpis: {
          invoices_this_period: invoices,
          invoices_prev_period: previousInvoices,
          invoices_growth_pct: previousInvoices > 0 ? Math.round(((invoices - previousInvoices) / previousInvoices) * 100) : 0,
          gmv_this_period: gmv,
          gmv_prev_period: sum(previous, 'gmv'),
          aov: invoices > 0 ? gmv / invoices : 0,
          overdue_count: sum(current, 'overdue_count'),
          overdue_sum: sum(current, 'overdue_amount'),
          outstanding_count: sum(current, 'outstanding_count'),
          outstanding_sum: sum(current, 'outstanding_amount'),
        },
      },
      error: null,
    };
  });

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({ from, rpc })),
    },
  };
});

import { NextRequest } from 'next/server';

import { GET } from '../../app/api/tenant/invoices/route';

describe('invoices landing API route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    getVerifiedClaimsMock.mockReset();
    getFlagMock.mockReset();
    getAuthUserDisplayNameMapMock.mockReset();
    invoiceKpiCallState.count = 0;
    getFlagMock.mockResolvedValue(true);
    getAuthUserDisplayNameMapMock.mockResolvedValue(new Map([
      ['seller-1', 'Priya Shah'],
      ['seller-2', 'Ravi Nair'],
    ]));
    queryState.buyers = [
      { id: 'buyer-1', business_name: 'Acme', geography: { city: 'Mumbai', state: 'MH' } },
      { id: 'buyer-2', business_name: 'Beta', geography: { city: 'Pune', state: 'MH' } },
    ];
    queryState.orders = [{ id: 'o1', order_number: 'ORD-2026-0001' }];
    queryState.estimates = [{ id: 'e1', estimate_number: 'EST-2026-0001' }];
    queryState.invoiceItems = [
      { invoice_id: 'i1' },
      { invoice_id: 'i1' },
      { invoice_id: 'i2' },
      { invoice_id: 'i3' },
    ];
    queryState.invoices = [
      {
        id: 'i1',
        location_id: 'loc-1',
        invoice_number: 'INV-2026-0001',
        buyer_id: 'buyer-1',
        order_id: 'o1',
        estimate_id: null,
        status: 'sent',
        total_amount: 4000,
        outstanding_balance: 4000,
        invoice_date: '2026-06-10T00:00:00.000Z',
        due_date: '2026-06-01T00:00:00.000Z',
        paid_at: null,
        created_by: 'seller-1',
        created_at: '2026-06-10T00:00:00.000Z',
      },
      {
        id: 'i2',
        location_id: 'loc-2',
        invoice_number: 'INV-2026-0002',
        buyer_id: 'buyer-2',
        order_id: null,
        estimate_id: 'e1',
        status: 'paid',
        total_amount: 9000,
        outstanding_balance: 0,
        invoice_date: '2026-06-11T00:00:00.000Z',
        due_date: null,
        paid_at: '2026-06-12T00:00:00.000Z',
        created_by: 'seller-2',
        created_at: '2026-06-11T00:00:00.000Z',
      },
      {
        id: 'i3',
        location_id: null,
        invoice_number: 'INV-2026-0003',
        buyer_id: 'buyer-1',
        order_id: null,
        estimate_id: null,
        status: 'sent',
        total_amount: 3000,
        outstanding_balance: 3000,
        invoice_date: '2026-05-11T00:00:00.000Z',
        due_date: '2026-05-20T00:00:00.000Z',
        paid_at: null,
        created_by: 'seller-1',
        created_at: '2026-05-11T00:00:00.000Z',
      },
    ];
    queryState.currentKpis = [
      {
        scope: 'tenant',
        location_id: null,
        day: '2026-06-10',
        invoices_count: 2,
        gmv: 13000,
        overdue_count: 1,
        overdue_amount: 4000,
        outstanding_count: 1,
        outstanding_amount: 4000,
      },
      {
        scope: 'location',
        location_id: 'loc-1',
        day: '2026-06-10',
        invoices_count: 1,
        gmv: 4000,
        overdue_count: 1,
        overdue_amount: 4000,
        outstanding_count: 1,
        outstanding_amount: 4000,
      },
      {
        scope: 'location',
        location_id: 'loc-2',
        day: '2026-06-11',
        invoices_count: 1,
        gmv: 9000,
        overdue_count: 0,
        overdue_amount: 0,
        outstanding_count: 0,
        outstanding_amount: 0,
      },
    ];
    queryState.previousKpis = [
      {
        scope: 'tenant',
        location_id: null,
        day: '2026-05-11',
        invoices_count: 1,
        gmv: 3000,
        overdue_count: 1,
        overdue_amount: 3000,
        outstanding_count: 1,
        outstanding_amount: 3000,
      },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds invoice workboard KPIs, source lines, and callouts', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin', sub: 'user-1' });

    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices?period=month'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.kpis.overdue_count).toBe(1);
    expect(body.kpis.overdue_sum).toBe(4000);
    expect(body.kpis.outstanding_count).toBe(1);
    const row = body.invoices.find((r: { id: string }) => r.id === 'i1');
    expect(row.status.value).toBe('overdue');
    expect(row.status.filter_chip).toBe('Overdue');
    expect(body.kpis.outstanding_sum).toBe(4000);
    expect(body.kpis.invoices_this_period).toBe(2);
    expect(body.kpis.invoices_prev_period).toBe(1);
    expect(body.kpis.invoices_growth_pct).toBe(100);
    expect(body.kpis.gmv_this_period).toBe(13000);
    expect(body.kpis.aov).toBe(6500);
    expect(row.buyer_city).toBe('Mumbai');
    expect(row.buyer_state).toBe('MH');
    expect(row.items_count).toBe(2);
    expect(row.source_label).toBe('ORD-2026-0001');
    expect(row.source_detail).toBe('Converted by Priya Shah');

    const estimateRow = body.invoices.find((r: { id: string }) => r.id === 'i2');
    expect(estimateRow.source_label).toBe('EST-2026-0001');
    expect(estimateRow.source_detail).toBe('Converted by Ravi Nair');

    expect(body.todays_read.needs_attention).toHaveLength(2);
    expect(body.todays_read.needs_attention.map((item: { invoice_number: string }) => item.invoice_number)).toContain('INV-2026-0003');
    expect(body.todays_read.top_spenders[0].invoice_number).toBe('INV-2026-0002');
    expect(body.todays_read.top_risers[0].buyer_name).toBe('Beta');
  });

  it('returns 403 for non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'buyer_admin', sub: 'user-1' });

    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices'));
    expect(res.status).toBe(403);
  });

  it('filters invoices to the assistant location scope', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_assistant', sub: 'user-1', location_ids: ['loc-1'] });

    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices?period=month'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0].id).toBe('i1');
    expect(body.kpis.invoices_this_period).toBe(1);
    expect(body.kpis.gmv_this_period).toBe(4000);
  });
});
