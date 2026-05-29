import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();

interface QueryState {
  buyers: Array<{ id: string; business_name: string; geography: Record<string, unknown> | null }>;
  monthOrders: Array<{
    id: string;
    order_number: string;
    buyer_id: string;
    status: 'draft' | 'received' | 'confirmed' | 'partially_dispatched' | 'dispatched' | 'delivered' | 'cancelled';
    total_amount: number;
    placed_at: string;
    created_at: string;
  }>;
  prevOrders: Array<{ id: string; total_amount: number }>;
  orderItems: Array<{ order_id: string }>;
}

const queryState: QueryState = {
  buyers: [],
  monthOrders: [],
  prevOrders: [],
  orderItems: [],
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private table: string;

    constructor(table: string) {
      this.table = table;
    }

    select() { return this; }
    eq() { return this; }
    is() { return this; }
    gte() { return this; }
    lt() { return this; }
    order() { return this; }
    in() { return this; }

    then(resolve: (value: { data: unknown; error: null }) => void) {
      if (this.table === 'buyers') return resolve({ data: queryState.buyers, error: null });
      if (this.table === 'orders_month') return resolve({ data: queryState.monthOrders, error: null });
      if (this.table === 'orders_prev') return resolve({ data: queryState.prevOrders, error: null });
      if (this.table === 'order_items') return resolve({ data: queryState.orderItems, error: null });
      return resolve({ data: [], error: null });
    }
  }

  const from = vi.fn((table: string) => {
    if (table === 'buyers') return new QueryMock('buyers');
    if (table === 'order_items') return new QueryMock('order_items');
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

import { GET } from '../../app/api/tenant/orders/route';

describe('orders landing API route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();

    queryState.buyers = [
      { id: 'buyer-1', business_name: 'Buyer One', geography: { city: 'Bengaluru' } },
      { id: 'buyer-2', business_name: 'Buyer Two', geography: { city: 'Mysuru' } },
      { id: 'buyer-3', business_name: 'Buyer Three', geography: { city: 'Hubli' } },
    ];

    queryState.monthOrders = [
      { id: 'o1', order_number: 'DF-1', buyer_id: 'buyer-1', status: 'confirmed', total_amount: 10000, placed_at: '2026-05-20T00:00:00.000Z', created_at: '2026-05-20T00:00:00.000Z' },
      { id: 'o2', order_number: 'DF-2', buyer_id: 'buyer-2', status: 'received', total_amount: 30000, placed_at: '2026-05-21T00:00:00.000Z', created_at: '2026-05-21T00:00:00.000Z' },
      { id: 'o3', order_number: 'DF-3', buyer_id: 'buyer-3', status: 'dispatched', total_amount: 50000, placed_at: '2026-05-22T00:00:00.000Z', created_at: '2026-05-22T00:00:00.000Z' },
      { id: 'o4', order_number: 'DF-4', buyer_id: 'buyer-1', status: 'cancelled', total_amount: 20000, placed_at: '2026-05-23T00:00:00.000Z', created_at: '2026-05-23T00:00:00.000Z' },
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
    ];
  });

  it('aggregates MTD numbers, maps hold to received, and caps callouts', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/tenant/orders') as any);
    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body.kpis.pending_dispatch_count).toBe(1);
    expect(body.kpis.on_hold_count).toBe(1);
    expect(body.kpis.orders_mtd).toBe(4);
    expect(body.kpis.gmv_mtd).toBe(110000);
    expect(body.kpis.aov).toBe(27500);

    expect(body.todays_read.needs_attention.length).toBeLessThanOrEqual(3);
    expect(body.todays_read.biggest_tickets.length).toBeLessThanOrEqual(2);
    expect(body.todays_read.in_motion.length).toBeLessThanOrEqual(2);
  });

  it('returns 403 for non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'buyer_admin' });

    const res = await GET(new Request('http://localhost/api/tenant/orders') as any);
    expect(res.status).toBe(403);
  });
});
