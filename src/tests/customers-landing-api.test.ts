import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
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
  let head = false;
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
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown; count?: number }) => unknown) => {
      const result = nextResult(key);
      let rows = Array.isArray(result.data) ? [...result.data] : [];
      for (const [column, value] of query.eq.mock.calls.map((args) => [args[0], args[1]] as const)) {
        rows = rows.filter((row) => !(column in (row as Record<string, unknown>)) || (row as Record<string, unknown>)[column] === value);
      }
      for (const [column, value] of query.in.mock.calls.map((args) => [args[0], args[1]] as const)) {
        const values = Array.isArray(value) ? value : [];
        rows = rows.filter((row) => values.includes((row as Record<string, unknown>)[column]));
      }
      return Promise.resolve(onFulfilled({
        data: head ? null : rows,
        error: result.error ?? null,
        count: head ? rows.length : undefined,
      }));
    },
  };
  const select = vi.fn((_columns?: string, options?: { head?: boolean }) => {
    head = Boolean(options?.head);
    return query;
  });

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);

  return { query, select };
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: (...args: unknown[]) => {
      const { select } = createQuery(`${schemaName}.${tableName}`);
      return select(...args);
    },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
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

    dbResponses['app.buyers_snapshot'] = [
      {
        data: [
          {
            buyer_id: 'buyer-active',
            is_active: true,
            is_dormant: false,
            outstanding_dues: 1000,
            overdue_amount: 1000,
            credit_limit: 100000,
            last_order_at: '2026-06-20T00:00:00Z',
            last_activity_at: '2026-06-20T00:00:00Z',
          },
          {
            buyer_id: 'buyer-dormant',
            is_active: true,
            is_dormant: true,
            outstanding_dues: 0,
            overdue_amount: 0,
            credit_limit: 50000,
            last_order_at: '2026-04-20T00:00:00Z',
            last_activity_at: '2026-04-20T00:00:00Z',
          },
          {
            buyer_id: 'buyer-inactive',
            is_active: false,
            is_dormant: true,
            outstanding_dues: 0,
            overdue_amount: 0,
            credit_limit: 25000,
            last_order_at: null,
            last_activity_at: null,
          },
        ],
      },
    ];
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
    dbResponses['app.kpi_buyers_daily'] = [
      {
        data: [
          {
            buyer_id: 'buyer-active',
            estimates_count: 0,
            orders_count: 1,
            invoices_count: 0,
            orders_gmv: 1000,
          },
        ],
      },
      {
        data: [
          {
            buyer_id: 'buyer-active',
            estimates_count: 0,
            orders_count: 1,
            invoices_count: 0,
            orders_gmv: 500,
          },
        ],
      },
      {
        data: [
          {
            buyer_id: 'buyer-active',
            estimates_count: 0,
            orders_count: 1,
            invoices_count: 0,
            orders_gmv: 1000,
          },
        ],
      },
      {
        data: [
          {
            buyer_id: 'buyer-active',
            estimates_count: 0,
            orders_count: 1,
            invoices_count: 0,
            orders_gmv: 500,
          },
        ],
      },
    ];
    dbResponses['app.cohort_members'] = [{ data: [] }];
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

  it('derives total counts from canonical buyer snapshot state', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month'),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.kpis.total).toBe(3);
    expect(body.total).toBe(3);
  });

  it('filters customers by lifecycle status buckets and due state', async () => {
    const activeResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&status=Active'),
    );
    expect(activeResponse.status).toBe(200);
    const activeBody = await activeResponse.json();
    expect(activeBody.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-active']);
    expect(activeBody.kpis.total).toBe(3);
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

  it('keeps aggregate KPIs stable when row filters change', async () => {
    const baselineResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month'),
    );
    const filteredResponse = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&status=Dormant'),
    );

    expect(baselineResponse.status).toBe(200);
    expect(filteredResponse.status).toBe(200);

    const baselineBody = await baselineResponse.json();
    const filteredBody = await filteredResponse.json();

    expect(filteredBody.kpis).toEqual(baselineBody.kpis);
    expect(filteredBody.callouts.needs_call.map((buyer: { id: string }) => buyer.id)).toEqual(
      baselineBody.callouts.needs_call.map((buyer: { id: string }) => buyer.id),
    );
    expect(filteredBody.callouts.top_spenders.map((buyer: { id: string }) => buyer.id)).toEqual(
      baselineBody.callouts.top_spenders.map((buyer: { id: string }) => buyer.id),
    );
    expect(filteredBody.callouts.top_risers.map((buyer: { id: string }) => buyer.id)).toEqual(
      baselineBody.callouts.top_risers.map((buyer: { id: string }) => buyer.id),
    );
    expect(filteredBody.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-dormant']);
  });

  it('counts filtered lifecycle results from the full buyer universe instead of the first page slice', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month&status=Inactive&limit=1'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.buyers.map((buyer: { id: string }) => buyer.id)).toEqual(['buyer-inactive']);
    expect(body.total).toBe(1);
    expect(body.nextCursor).toBeNull();
  });
});
