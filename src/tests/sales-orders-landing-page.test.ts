import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getAuthUserDisplayNameMapMock = vi.fn();

interface QueryState {
  buyers: Array<{ id: string; business_name: string; geography: Record<string, unknown> | null }>;
  monthOrders: Array<{
    id: string;
    order_number: string;
    buyer_id: string;
    status: string;
    source: string | null;
    catalog_id: string | null;
    estimate_id: string | null;
    placed_by: string | null;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    placed_at: string;
    created_at: string;
  }>;
  prevOrders: Array<{ id: string; total_amount: number }>;
  orderItems: Array<{ order_id: string }>;
  catalogs: Array<{ id: string; name: string }>;
  estimates: Array<{ id: string; estimate_number: string | null }>;
}

const queryState: QueryState = {
  buyers: [],
  monthOrders: [],
  prevOrders: [],
  orderItems: [],
  catalogs: [],
  estimates: [],
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/auth-user-directory', () => ({
  getAuthUserDisplayNameMap: (...args: unknown[]) => getAuthUserDisplayNameMapMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private table: string;

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
    gte() {
      return this;
    }
    lt() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    in() {
      return this;
    }

    then(resolve: (value: { data: unknown; error: null }) => void) {
      if (this.table === 'buyers') return resolve({ data: queryState.buyers, error: null });
      if (this.table === 'orders_month') return resolve({ data: queryState.monthOrders, error: null });
      if (this.table === 'orders_prev') return resolve({ data: queryState.prevOrders, error: null });
      if (this.table === 'order_items') return resolve({ data: queryState.orderItems, error: null });
      if (this.table === 'published_catalogs') return resolve({ data: queryState.catalogs, error: null });
      if (this.table === 'estimates') return resolve({ data: queryState.estimates, error: null });
      return resolve({ data: [], error: null });
    }
  }

  const from = vi.fn((table: string) => {
    if (table === 'buyers') return new QueryMock('buyers');
    if (table === 'order_items') return new QueryMock('order_items');
    if (table === 'published_catalogs') return new QueryMock('published_catalogs');
    if (table === 'estimates') return new QueryMock('estimates');
    if (table === 'kpi_tenant_daily') return new QueryMock('unknown');
    if (table === 'orders') {
      let calls = (from as unknown as { __ordersCalls?: number }).__ordersCalls ?? 0;
      calls += 1;
      (from as unknown as { __ordersCalls?: number }).__ordersCalls = calls;
      return new QueryMock(calls === 1 ? 'orders_month' : 'orders_prev');
    }
    return new QueryMock('unknown');
  });

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({ from })),
    },
  };
});

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/tenant/orders/route';

describe('sales orders landing API route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getAuthUserDisplayNameMapMock.mockReset();
    getAuthUserDisplayNameMapMock.mockResolvedValue(new Map([
      ['seller-1', 'Priya Shah'],
      ['buyer-user-1', 'Asha Singh'],
      ['seller-2', 'Ravi Nair'],
    ]));

    queryState.buyers = [
      { id: 'buyer-1', business_name: 'Buyer One', geography: { city: 'Bengaluru' } },
      { id: 'buyer-2', business_name: 'Buyer Two', geography: { city: 'Mysuru' } },
      { id: 'buyer-3', business_name: 'Buyer Three', geography: { city: 'Hubli' } },
    ];

    queryState.monthOrders = [
      { id: 'o1', order_number: 'DF-1', buyer_id: 'buyer-1', status: 'confirmed', source: 'cockpit_manual', catalog_id: 'cat-1', estimate_id: 'est-1', placed_by: 'seller-1', subtotal: 8475, tax_amount: 1525, total_amount: 10000, placed_at: '2026-05-20T00:00:00.000Z', created_at: '2026-05-20T00:00:00.000Z' },
      { id: 'o2', order_number: 'DF-2', buyer_id: 'buyer-2', status: 'received', source: 'buyer_app', catalog_id: 'cat-2', estimate_id: null, placed_by: 'buyer-user-1', subtotal: 25424, tax_amount: 4576, total_amount: 30000, placed_at: '2026-05-21T00:00:00.000Z', created_at: '2026-05-21T00:00:00.000Z' },
      { id: 'o3', order_number: 'DF-3', buyer_id: 'buyer-3', status: 'dispatched', source: 'csv_import', catalog_id: null, estimate_id: null, placed_by: 'seller-2', subtotal: 42373, tax_amount: 7627, total_amount: 50000, placed_at: '2026-05-22T00:00:00.000Z', created_at: '2026-05-22T00:00:00.000Z' },
      { id: 'o4', order_number: 'DF-4', buyer_id: 'buyer-1', status: 'cancelled', source: 'cockpit_manual', catalog_id: null, estimate_id: null, placed_by: 'seller-1', subtotal: 16949, tax_amount: 3051, total_amount: 20000, placed_at: '2026-05-23T00:00:00.000Z', created_at: '2026-05-23T00:00:00.000Z' },
      { id: 'o5', order_number: 'DF-5', buyer_id: 'buyer-2', status: 'partially_dispatched', source: 'buyer_app', catalog_id: 'cat-2', estimate_id: null, placed_by: 'buyer-user-1', subtotal: 12712, tax_amount: 2288, total_amount: 15000, placed_at: '2026-05-24T00:00:00.000Z', created_at: '2026-05-24T00:00:00.000Z' },
      { id: 'o6', order_number: 'DF-6', buyer_id: 'buyer-3', status: 'invoiced', source: 'csv_import', catalog_id: null, estimate_id: null, placed_by: 'seller-2', subtotal: 6780, tax_amount: 1220, total_amount: 8000, placed_at: '2026-05-25T00:00:00.000Z', created_at: '2026-05-25T00:00:00.000Z' },
      { id: 'o7', order_number: 'DF-7', buyer_id: 'buyer-1', status: 'partially_invoiced', source: 'cockpit_manual', catalog_id: 'cat-1', estimate_id: null, placed_by: 'seller-1', subtotal: 7627, tax_amount: 1373, total_amount: 9000, placed_at: '2026-05-26T00:00:00.000Z', created_at: '2026-05-26T00:00:00.000Z' },
    ];

    queryState.prevOrders = [
      { id: 'p1', total_amount: 20000 },
      { id: 'p2', total_amount: 20000 },
    ];

    queryState.orderItems = [
      { order_id: 'o1' },
      { order_id: 'o2' },
      { order_id: 'o2' },
      { order_id: 'o3' },
      { order_id: 'o4' },
      { order_id: 'o5' },
      { order_id: 'o6' },
      { order_id: 'o7' },
    ];

    queryState.catalogs = [
      { id: 'cat-1', name: 'Summer Sell-in' },
      { id: 'cat-2', name: 'Monsoon Promo' },
    ];

    queryState.estimates = [
      { id: 'est-1', estimate_number: 'EST-2042' },
    ];
  });

  it('aggregates MTD numbers, maps received to Received neutral, and caps callouts', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new NextRequest('http://localhost/api/tenant/orders'));
    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body.kpis.pending_dispatch_count).toBe(1);
    expect(body.kpis.received_count).toBe(1);
    expect(body.kpis.orders_mtd).toBe(7);
    expect(body.kpis.gmv_mtd).toBe(142000);
    expect(body.kpis.aov).toBe(142000 / 7);

    const receivedRow = body.orders.find((r: { order_id: string }) => r.order_id === 'DF-2');
    expect(receivedRow.status.label).toBe('Received');
    expect(receivedRow.status.tone).toBe('neutral');
    expect(receivedRow.status.filter_chip).toBe('Received');

    const invoicedRow = body.orders.find((r: { order_id: string }) => r.order_id === 'DF-6');
    expect(invoicedRow.status.label).toBe('Invoiced');
    expect(invoicedRow.status.tone).toBe('success');
    expect(invoicedRow.status.filter_chip).toBe('Invoiced');

    const partialInv = body.orders.find((r: { order_id: string }) => r.order_id === 'DF-7');
    expect(partialInv.status.label).toBe('Partly invoiced');
    expect(partialInv.status.tone).toBe('warning');
    expect(partialInv.status.filter_chip).toBe('Invoiced');

    const convertedRow = body.orders.find((r: { order_id: string }) => r.order_id === 'DF-1');
    expect(convertedRow.source_label).toBe('EST-2042');
    expect(convertedRow.source_detail).toBe('Converted by Priya Shah');
    expect(convertedRow.catalog_name).toBe('Summer Sell-in');
    expect(convertedRow.subtotal).toBe(8475);
    expect(convertedRow.tax_amount).toBe(1525);
    expect(convertedRow.total_amount).toBe(10000);

    const buyerAppRow = body.orders.find((r: { order_id: string }) => r.order_id === 'DF-2');
    expect(buyerAppRow.source_label).toBe('buyer_app');
    expect(buyerAppRow.source_detail).toBe('Asha Singh');

    expect(body.todays_read.needs_attention.length).toBeLessThanOrEqual(3);
    expect(body.todays_read.needs_attention.every((r: { status: { value: string } }) => r.status.value === 'received')).toBe(true);

    expect(body.todays_read.biggest_tickets.length).toBeLessThanOrEqual(3);
    expect(body.todays_read.in_motion.length).toBeLessThanOrEqual(3);
    expect(
      body.todays_read.in_motion.every(
        (r: { status: { value: string } }) => r.status.value === 'dispatched' || r.status.value === 'partially_dispatched'
      )
    ).toBe(true);
  });

  it('returns 403 for non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'buyer_admin' });

    const res = await GET(new NextRequest('http://localhost/api/tenant/orders'));
    expect(res.status).toBe(403);
  });
});
