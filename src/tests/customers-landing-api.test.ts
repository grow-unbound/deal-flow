import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const loadBuyerCreditSnapshotsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

const dbResponses: Record<string, QueryResult[]> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) {
    return queue[0] ?? {};
  }
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    neq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);

  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

vi.mock('@/lib/server/buyer-credit', () => ({
  loadBuyerCreditSnapshots: (...args: unknown[]) => loadBuyerCreditSnapshotsMock(...args),
}));

import { GET } from '../../app/api/tenant/customers/route';

describe('customers landing api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00Z'));
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);
    loadBuyerCreditSnapshotsMock.mockResolvedValue(
      new Map([
        ['buyer-active', { outstanding_dues: 1000 }],
        ['buyer-dormant', { outstanding_dues: 0 }],
        ['buyer-inactive', { outstanding_dues: 0 }],
      ]),
    );

    dbResponses['app.buyers'] = [
      {
        data: [
          {
            id: 'buyer-active',
            business_name: 'Singh Hospitality',
            tier: 'A',
            phone: '9876543210',
            gst_treatment: 'registered',
            status: 'active',
            credit_limit: 100000,
            is_active: true,
            geography: { city: 'Bengaluru', state: 'Karnataka' },
          },
          {
            id: 'buyer-dormant',
            business_name: 'Dormant Traders',
            tier: 'B',
            phone: '9876543211',
            gst_treatment: 'unregistered',
            status: 'active',
            credit_limit: 50000,
            is_active: true,
            geography: { city: 'Mysuru', state: 'Karnataka' },
          },
          {
            id: 'buyer-inactive',
            business_name: 'Inactive Stores',
            tier: 'C',
            phone: '9876543212',
            gst_treatment: 'registered',
            status: 'inactive',
            credit_limit: 25000,
            is_active: false,
            geography: { city: 'Delhi', state: 'Delhi' },
          },
        ],
      },
    ];
    dbResponses['app.orders'] = [
      {
        data: [
          {
            id: 'order-1',
            buyer_id: 'buyer-active',
            total_amount: 1000,
            placed_at: '2026-06-20T00:00:00Z',
            status: 'confirmed',
            deleted_at: null,
          },
        ],
      },
      {
        data: [
          {
            id: 'order-prev-1',
            buyer_id: 'buyer-active',
            total_amount: 500,
            placed_at: '2026-05-20T00:00:00Z',
            status: 'confirmed',
            deleted_at: null,
          },
        ],
      },
      {
        data: [
          {
            id: 'order-recent-1',
            buyer_id: 'buyer-active',
            placed_at: '2026-06-20T00:00:00Z',
            status: 'confirmed',
            deleted_at: null,
          },
        ],
      },
    ];
    dbResponses['app.cohort_members'] = [{ data: [] }];
    dbResponses['app.invoices'] = [
      {
        data: [
          { buyer_id: 'buyer-active', status: 'overdue', outstanding_balance: 1000, deleted_at: null },
          { buyer_id: 'buyer-dormant', status: 'sent', outstanding_balance: 0, deleted_at: null },
        ],
      },
    ];
    dbResponses['app.price_list_assignments'] = [{ data: [] }];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps customers landing available when price-list enrichment fails', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month'),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.buyers).toHaveLength(3);
    expect(body.buyers[0].active_price_list).toBeNull();
    expect(body.kpis.total).toBe(3);
  });

  it('filters customers by lifecycle status buckets and due state', async () => {
    const activeResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&status=Active'),
    );
    expect(activeResponse.status).toBe(200);
    const activeBody = await activeResponse.json();
    expect(activeBody.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-active']);
    expect(activeBody.kpis.total).toBe(1);
    expect(activeBody.kpis.active).toBe(1);

    const dormantResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&status=Dormant'),
    );
    expect(dormantResponse.status).toBe(200);
    const dormantBody = await dormantResponse.json();
    expect(dormantBody.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-dormant']);

    const inactiveResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&status=Inactive'),
    );
    expect(inactiveResponse.status).toBe(200);
    const inactiveBody = await inactiveResponse.json();
    expect(inactiveBody.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-inactive']);

    const overdueResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&due=Overdue'),
    );
    expect(overdueResponse.status).toBe(200);
    const overdueBody = await overdueResponse.json();
    expect(overdueBody.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-active']);
  });
});
