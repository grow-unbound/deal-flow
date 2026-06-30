import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  loadBuyerCreditSnapshots: async () => new Map(),
}));

import { GET } from '../../app/api/tenant/customers/route';

describe('customers landing api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.buyers'] = [
      {
        data: [
          {
            id: 'buyer-1',
            business_name: 'Singh Hospitality',
            tier: 'A',
            phone: '9876543210',
            gst_treatment: 'registered',
            status: 'active',
            credit_limit: 100000,
            is_active: true,
            geography: { city: 'Bengaluru', state: 'Karnataka' },
          },
        ],
      },
    ];
    dbResponses['app.orders'] = [{ data: [] }, { data: [] }, { data: [] }];
    dbResponses['app.cohort_members'] = [{ data: [] }];
    dbResponses['app.invoices'] = [{ data: [] }, { data: [] }];
    dbResponses['app.price_list_assignments'] = [
      {
        error: { message: 'Bad Request' },
      },
    ];
  });

  it('keeps customers landing available when price-list enrichment fails', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers?period=month'),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.buyers).toHaveLength(1);
    expect(body.buyers[0].active_price_list).toBeNull();
    expect(body.kpis.total).toBe(1);
  });
});
