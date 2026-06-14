import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getAuthUserDisplayNameMapMock = vi.fn();

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
}

const queryState: QueryState = {
  buyers: [],
  invoices: [],
  invoiceItems: [],
  orders: [],
  estimates: [],
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

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private table: string;
    private conditions: Array<{ kind: 'in'; column: string; value: unknown }> = [];

    constructor(table: string) {
      this.table = table;
    }

    select() {
      return this;
    }
    eq() {
      return this;
    }
    is() {
      return this;
    }
    in() {
      this.conditions.push({ kind: 'in', column: arguments[0] as string, value: arguments[1] });
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }

    then(resolve: (value: { data: unknown; error: null }) => void) {
      const applyFilters = (rows: Array<Record<string, unknown>>) => {
        let result = [...rows];
        for (const condition of this.conditions) {
          const values = Array.isArray(condition.value) ? condition.value : [];
          result = result.filter((row) => values.includes(row[condition.column]));
        }
        return result;
      };

      if (this.table === 'buyers') return resolve({ data: queryState.buyers, error: null });
      if (this.table === 'invoices') return resolve({ data: applyFilters(queryState.invoices as Array<Record<string, unknown>>), error: null });
      if (this.table === 'invoice_items') return resolve({ data: applyFilters(queryState.invoiceItems as Array<Record<string, unknown>>), error: null });
      if (this.table === 'orders') return resolve({ data: queryState.orders, error: null });
      if (this.table === 'estimates') return resolve({ data: queryState.estimates, error: null });
      return resolve({ data: [], error: null });
    }
  }

  const from = vi.fn((table: string) => new QueryMock(table));

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({ from })),
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

    expect(body.todays_read.needs_attention).toHaveLength(1);
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
  });
});
