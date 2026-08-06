import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };
const dbResponses: Record<string, QueryResult[]> = {};
const queriesByKey: Record<string, Array<ReturnType<typeof createQuery>>> = {};
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
const tableCalls: string[] = [];

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    or: vi.fn(),
    gt: vi.fn(),
    lte: vi.fn(),
    not: vi.fn(),
    limit: vi.fn(),
    textSearch: vi.fn(),
    select: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown; count: number | null }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.textSearch.mockReturnValue(query);
  query.select.mockReturnValue(query);
  (queriesByKey[key] ??= []).push(query);
  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => {
    tableCalls.push(`${schemaName}.${tableName}`);
    return {
      select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
    };
  }),
  rpc: vi.fn((functionName: string, args: Record<string, unknown>) => {
    rpcCalls.push([functionName, args]);
    const result = nextResult(`${schemaName}.rpc.${functionName}`);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: (...args: unknown[]) => schemaMock(...args) },
}));

import { GET } from '../../app/api/tenant/locations/landing/route';

describe('GET /api/tenant/locations/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];
    for (const key of Object.keys(queriesByKey)) delete queriesByKey[key];
    rpcCalls.length = 0;
    tableCalls.length = 0;

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });

    dbResponses['app.metrics_location_period_summary'] = [{
      data: [
        {
          location_id: 'loc-1',
          invoice_count: 4,
          invoice_value: 100000,
          invoice_buyer_count: 2,
          estimate_count: 3,
          estimate_value: 125000,
          order_count: 2,
          order_value: 90000,
          primary_demand_kind: 'orders',
          primary_demand_count: 2,
          primary_demand_value: 90000,
          primary_demand_buyer_count: 2,
        },
        {
          location_id: 'loc-2',
          invoice_count: 1,
          invoice_value: 50000,
          invoice_buyer_count: 1,
          estimate_count: 1,
          estimate_value: 45000,
          order_count: 1,
          order_value: 30000,
          primary_demand_kind: 'orders',
          primary_demand_count: 1,
          primary_demand_value: 30000,
          primary_demand_buyer_count: 1,
        },
      ],
    }];
    dbResponses['app.metrics_location_now_summary'] = [{
      data: [
        { location_id: 'loc-1', open_estimate_count: 0, open_order_count: 1, overdue_amount: 12000 },
        { location_id: 'loc-2', open_estimate_count: 0, open_order_count: 0, overdue_amount: 0 },
      ],
    }];
    dbResponses['app.locations'] = [{
      data: [
        {
          id: 'loc-1',
          name: 'Alpha Hub',
          address: { line1: '1 MG Road', city: 'Bengaluru', state: 'KA', pincode: '560001' },
          phone_number: '9999999999',
          status: 'active',
        },
        {
          id: 'loc-2',
          name: 'Beta Hub',
          address: { line1: '2 Mount Road', city: 'Chennai', state: 'TN', pincode: '600001' },
          phone_number: '8888888888',
          status: 'active',
        },
      ],
    }];
  });

  it('returns 403 for seller_assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/locations/landing'));
    expect(response.status).toBe(403);
  });

  it('reads the V4 location period and now summaries for table rows', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/locations/landing?limit=25'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.locations).toHaveLength(2);
    expect(body.locations[0]).toEqual(expect.objectContaining({
      id: 'loc-1',
      name: 'Alpha Hub',
      gmv_mtd: 100000,
      active_buyers: 2,
      overdue_amount: 12000,
      primary_demand_value: 90000,
    }));
    expect(body.period_key).toBe('this_month');
    expect(body.grain).toBe('month');
    expect(body.nextCursor).toBeNull();
    expect(body.filters.groups.map((group: { key: string }) => group.key)).toEqual(['status', 'attention']);
    expect(rpcCalls).toEqual([]);
    expect(tableCalls).toEqual([
      'app.locations',
      'app.locations',
      'app.metrics_location_period_summary',
      'app.metrics_location_now_summary',
    ]);
    expect(queriesByKey['app.metrics_location_period_summary'][0].eq).toHaveBeenCalledWith('grain', 'month');
    expect(queriesByKey['app.metrics_location_period_summary'][0].in).toHaveBeenCalledWith('location_id', ['loc-1', 'loc-2']);
  });

  it('forwards search as an entity-id prefilter before reading V4 rows', async () => {
    dbResponses['app.locations'] = [
      { data: [{ id: 'loc-2' }] },
      {
        data: [{
          id: 'loc-2',
          name: 'Beta Hub',
          address: { city: 'Chennai' },
          phone_number: null,
          status: 'active',
        }],
      },
    ];
    dbResponses['app.metrics_location_period_summary'] = [{
      data: [{
        location_id: 'loc-2',
        invoice_count: 1,
        invoice_value: 50000,
        invoice_buyer_count: 1,
        estimate_count: 0,
        estimate_value: 0,
        order_count: 0,
        order_value: 0,
        primary_demand_kind: 'none',
        primary_demand_count: 0,
        primary_demand_value: 0,
        primary_demand_buyer_count: 0,
      }],
    }];
    dbResponses['app.metrics_location_now_summary'] = [{ data: [{ location_id: 'loc-2', open_estimate_count: 0, open_order_count: 0, overdue_amount: 0 }] }];

    const response = await GET(new NextRequest('http://localhost/api/tenant/locations/landing?search=beta'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].name).toBe('Beta Hub');
    expect(queriesByKey['app.metrics_location_period_summary'][0].in).toHaveBeenCalledWith('location_id', ['loc-2']);
    expect(rpcCalls).toEqual([]);
  });

  it('caps top80 preset rows using the V4 top80 cache', async () => {
    dbResponses['app.metrics_tenant_top80_cache'] = [{ data: [{ top80_count: 1 }] }];
    const preset = encodeURIComponent(JSON.stringify({ sort: 'invoice_value_desc', cutoff: 'top80' }));

    const response = await GET(new NextRequest(`http://localhost/api/tenant/locations/landing?filter_preset=${preset}&limit=25`));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].id).toBe('loc-1');
    expect(queriesByKey['app.metrics_tenant_top80_cache'][0].eq).toHaveBeenCalledWith('entity_kind', 'locations');
    expect(queriesByKey['app.metrics_location_period_summary'][0].gt).toHaveBeenCalledWith('invoice_value', 0);
    expect(queriesByKey['app.metrics_location_period_summary'][0].limit).toHaveBeenCalledWith(2);
    expect(rpcCalls).toEqual([]);
  });

  it('applies open_demand preset from the V4 now summary', async () => {
    const preset = encodeURIComponent(JSON.stringify({ open_demand: true }));

    const response = await GET(new NextRequest(`http://localhost/api/tenant/locations/landing?filter_preset=${preset}&limit=25`));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.sort).toBe('open_demand_value');
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].id).toBe('loc-1');
    expect(queriesByKey['app.metrics_location_period_summary'][0].in).toHaveBeenCalledWith('location_id', ['loc-1', 'loc-2']);
    expect(queriesByKey['app.metrics_location_now_summary'][0].in).toHaveBeenCalledWith('location_id', ['loc-1', 'loc-2']);
    expect(rpcCalls).toEqual([]);
  });
});
