import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
  decodeJWTPayload: vi.fn(),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

type QueryState = {
  table: string;
  select: string;
  eqs: Record<string, unknown>;
  isNulls: Set<string>;
  inValues: Record<string, unknown[]>;
  limitValue?: number;
  maybeSingle: boolean;
};

function createQueryResolver() {
  return (state: QueryState): QueryResult => {
    if (state.table === 'buyer_app_snapshot') {
      return {
        data: {
          total_buyers: 4,
          enabled_buyers: 2,
        },
      };
    }

    if (state.table === 'buyers' && state.select === 'id, buyer_app_enabled') {
      return {
        data: [
          { id: 'buyer-1', buyer_app_enabled: true },
          { id: 'buyer-2', buyer_app_enabled: true },
          { id: 'buyer-3', buyer_app_enabled: false },
          { id: 'buyer-4', buyer_app_enabled: false },
        ],
      };
    }

    if (state.table === 'buyers') {
      return {
        data: [
          {
            id: 'buyer-1',
            business_name: 'Alpha Retail',
            contact_name: 'Asha',
            phone: '9999999991',
            geography: { city: 'Hyderabad', state: 'Telangana' },
            buyer_app_enabled: true,
            tier: 'A',
          },
          {
            id: 'buyer-2',
            business_name: 'Beta Stores',
            contact_name: 'Bharat',
            phone: '9999999992',
            geography: { city: 'Pune', state: 'Maharashtra' },
            buyer_app_enabled: true,
            tier: 'B',
          },
        ],
      };
    }

    if (
      state.table === 'orders'
      && state.select === 'buyer_id, total_amount, placed_at'
      && state.eqs.is_buyer_app_order === true
    ) {
      return { data: [] };
    }

    if (
      state.table === 'orders'
      && state.select === 'buyer_id, total_amount'
      && state.eqs.is_buyer_app_order === false
    ) {
      return { data: [] };
    }

    if (
      state.table === 'orders'
      && state.select === 'buyer_id'
      && state.eqs.is_buyer_app_order === false
    ) {
      return {
        data: [
          { buyer_id: 'buyer-3' },
          { buyer_id: 'buyer-3' },
          { buyer_id: 'buyer-2' },
        ],
      };
    }

    if (
      state.table === 'orders'
      && state.select === 'buyer_id'
      && state.eqs.is_buyer_app_order === true
    ) {
      return {
        data: [
          { buyer_id: 'buyer-2' },
          { buyer_id: 'buyer-2' },
          { buyer_id: 'buyer-4' },
        ],
      };
    }

    throw new Error(`Unexpected query: ${JSON.stringify(state)}`);
  };
}

function createQuery(state: QueryState, resolve: (state: QueryState) => QueryResult) {
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      state.eqs[column] = value;
      return query;
    }),
    is: vi.fn((column: string, value: unknown) => {
      if (value === null) state.isNulls.add(column);
      return query;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.inValues[column] = values;
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn((value: number) => {
      state.limitValue = value;
      return query;
    }),
    gte: vi.fn(() => query),
    textSearch: vi.fn(() => query),
    maybeSingle: vi.fn(() => {
      state.maybeSingle = true;
      return query;
    }),
    then: (
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve(state)).then(
      (result) => onFulfilled({ data: result.data ?? null, error: result.error ?? null }),
      onRejected,
    ),
  };

  return query;
}

const queryResolver = createQueryResolver();
const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn((selectClause: string) => createQuery({
      table: tableName,
      select: selectClause,
      eqs: {},
      isNulls: new Set<string>(),
      inValues: {},
      maybeSingle: false,
    }, queryResolver)),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/buyer-app/access/route';

describe('GET /api/tenant/buyer-app/access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('keeps KPI counts tenant-scoped when the page is filtered and limited', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/buyer-app/access?limit=1&status=enabled&q=alpha'),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.kpis).toEqual({
      enabled_count: 2,
      not_enabled_count: 2,
      suggested_count: 1,
      inactive_count: 1,
      total_count: 4,
    });
    expect(body.buyers).toHaveLength(1);
    expect(body.buyers[0].id).toBe('buyer-1');
    expect(body.has_more).toBe(true);
    expect(body.limit).toBe(1);
  });
});
