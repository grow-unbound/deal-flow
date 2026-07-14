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
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
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

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });

    const locations = [
        {
          id: 'loc-1',
          name: 'Alpha Hub',
          address: { line1: '1 MG Road', city: 'Bengaluru', state: 'KA', pincode: '560001' },
          deleted_at: null,
          phone_number: '9999999999',
          status: 'active',
        },
        {
          id: 'loc-2',
          name: 'Beta Hub',
          address: { line1: '2 Mount Road', city: 'Chennai', state: 'TN', pincode: '600001' },
          deleted_at: null,
          phone_number: '8888888888',
          status: 'active',
        },
      ];
    dbResponses['app.locations'] = [{ data: locations }, { data: locations }];

    dbResponses['app.locations_snapshot'] = [{
      data: [
        {
          location_id: 'loc-1',
          sku_count: 12,
          oos_sku_count: 2,
          low_stock_sku_count: 1,
          outstanding_dues: 125000,
          oldest_unpaid_days: 45,
        },
        {
          location_id: 'loc-2',
          sku_count: 5,
          oos_sku_count: 0,
          low_stock_sku_count: 0,
          outstanding_dues: 0,
          oldest_unpaid_days: 0,
        },
      ],
    }];

    dbResponses['app.kpi_location_daily'] = [{
      data: [
        { location_id: 'loc-1', gmv: 100000, orders_count: 3 },
        { location_id: 'loc-2', gmv: 50000, orders_count: 1 },
      ],
    }];

    dbResponses['app.orders'] = [{
      data: [
        { location_id: 'loc-1', buyer_id: 'buyer-1' },
        { location_id: 'loc-1', buyer_id: 'buyer-2' },
      ],
    }];

    dbResponses['app.estimates'] = [{ data: [] }];
    dbResponses['app.invoices'] = [{ data: [] }];
    dbResponses['app.rpc.search_seller_location_landing_ids'] = [{
      data: [
        { id: 'loc-1', total_count: 2 },
        { id: 'loc-2', total_count: 2 },
      ],
    }];
    dbResponses['app.rpc.get_seller_locations_landing_summary'] = [{
      data: {
        kpis: { active_locations: 2, top_location_name: 'Alpha Hub', top_location_gmv_share_pct: 67 },
        callouts: {
          conversions: [],
          top_locations: [{ id: 'loc-1', name: 'Alpha Hub', city: 'Bengaluru', initials: 'AH' }],
          collections_overdue: [],
        },
      },
    }];
    dbResponses['app.rpc.get_seller_location_landing_row_metrics'] = [{
      data: locations.map((location, index) => ({
        location_id: location.id,
        sku_count: index === 0 ? 20 : 10,
        oos_sku_count: index === 0 ? 2 : 0,
        low_stock_sku_count: index === 0 ? 3 : 0,
        outstanding_dues: index === 0 ? 12000 : 0,
        oldest_unpaid_days: index === 0 ? 45 : 0,
        gmv_current: index === 0 ? 100000 : 50000,
        gmv_previous: 0,
        active_buyers: index === 0 ? 2 : 0,
      })),
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

  it('keeps KPI and callout totals tenant-wide when search filters the visible rows', async () => {
    dbResponses['app.rpc.search_seller_location_landing_ids'] = [{ data: [{ id: 'loc-2', total_count: 1 }] }];
    const response = await GET(new NextRequest('http://localhost/api/tenant/locations/landing?search=beta'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].name).toBe('Beta Hub');
    expect(body.kpis.active_locations).toBe(2);
    expect(body.kpis.top_location_name).toBe('Alpha Hub');
    expect(body.callouts.top_locations[0]?.name).toBe('Alpha Hub');
    expect(rpcCalls).toContainEqual(['search_seller_location_landing_ids', expect.objectContaining({
      p_query: 'beta',
      p_limit: 50,
    })]);
  });

  it('skips summaries and hydrates only returned IDs on later pages', async () => {
    dbResponses['app.rpc.search_seller_location_landing_ids'] = [{ data: [{ id: 'loc-2', total_count: 75 }] }];
    dbResponses['app.locations'] = [{ data: [{
      id: 'loc-2', name: 'Beta Hub', address: { city: 'Chennai' }, phone_number: null, status: 'active',
    }] }];
    dbResponses['app.rpc.get_seller_location_landing_row_metrics'] = [{ data: [{
      location_id: 'loc-2', sku_count: 10, oos_sku_count: 0, low_stock_sku_count: 0,
      outstanding_dues: 0, oldest_unpaid_days: null, gmv_current: 50000, gmv_previous: 40000, active_buyers: 1,
    }] }];

    const response = await GET(new NextRequest('http://localhost/api/tenant/locations/landing?offset=50&limit=50&include_summary=false'));
    expect(response.status).toBe(200);
    expect(rpcCalls.some(([name]) => name === 'get_seller_locations_landing_summary')).toBe(false);
    expect(rpcCalls).toContainEqual(['get_seller_location_landing_row_metrics', expect.objectContaining({ p_location_ids: ['loc-2'] })]);
    expect(queriesByKey['app.locations']?.[0]?.in).toHaveBeenCalledWith('id', ['loc-2']);
    expect(queriesByKey['app.locations_snapshot']).toBeUndefined();
    expect(queriesByKey['app.kpi_location_daily']).toBeUndefined();
    expect(queriesByKey['app.orders']).toBeUndefined();
    expect(queriesByKey['app.estimates']).toBeUndefined();
    expect(queriesByKey['app.invoices']).toBeUndefined();
  });
});
