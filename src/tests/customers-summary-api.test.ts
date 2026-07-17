import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

const dbResponses: Record<string, QueryResult[]> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
  rpc: vi.fn((fnName: string) => {
    const result = nextResult(`${schemaName}.rpc.${fnName}`);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/customers/summary/route';

describe('customers summary api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];
  });

  it('returns buyer-state summary fields from the Metrics V2 customer summary RPC', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
      location_ids: null,
    });

    dbResponses['app.rpc.get_metrics_v2_customer_summary'] = [{
      data: {
        total_count: 3,
        active_count: 1,
        dormant_count: 1,
        due_count: 2,
        overdue_count: 1,
        outstanding_dues: 5250,
        overdue_amount: 1000,
        refreshed_at: '2026-07-07T11:00:00Z',
      },
    }];

    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/customers/summary'));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({
      total_count: 3,
      active_count: 1,
      dormant_count: 1,
      due_count: 2,
      overdue_count: 1,
      outstanding_dues: 5250,
      overdue_amount: 1000,
      refreshed_at: '2026-07-07T11:00:00Z',
    });
  });

  it('passes assistant location scope to the Metrics V2 customer summary RPC', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      sub: 'user-2',
      location_ids: ['location-1', 'location-2'],
    });

    dbResponses['app.rpc.get_metrics_v2_customer_summary'] = [{
      data: {
        total_count: 1,
        active_count: 1,
        dormant_count: 0,
        due_count: 1,
        overdue_count: 1,
        outstanding_dues: 5000,
        overdue_amount: 500,
        refreshed_at: '2026-07-07T12:00:00Z',
      },
    }];

    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/customers/summary'));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({
      total_count: 1,
      active_count: 1,
      dormant_count: 0,
      due_count: 1,
      overdue_count: 1,
      outstanding_dues: 5000,
      overdue_amount: 500,
      refreshed_at: '2026-07-07T12:00:00Z',
    });
    const rpcMock = schemaMock.mock.results.at(-1)?.value.rpc;
    expect(rpcMock).toHaveBeenCalledWith('get_metrics_v2_customer_summary', {
      p_tenant_id: 'tenant-1',
      p_location_ids: ['location-1', 'location-2'],
    });
  });
});
