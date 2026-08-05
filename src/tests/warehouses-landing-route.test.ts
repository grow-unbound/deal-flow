import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

type QueryResult = { data?: unknown; error?: unknown };
const dbResponses: Record<string, QueryResult> = {};
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
const queriesByKey: Record<string, Array<ReturnType<typeof createQuery>>> = {};

function createQuery(key: string) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = dbResponses[key] ?? {};
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
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
    const result = dbResponses[`${schemaName}.rpc.${functionName}`] ?? {};
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/warehouses/landing/route';

describe('GET /api/tenant/warehouses/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    for (const key of Object.keys(queriesByKey)) delete queriesByKey[key];
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });

    dbResponses['app.warehouses'] = {
      data: [
        {
          id: 'wh-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          name: 'North Warehouse',
          address: { city: 'Bengaluru', state: 'KA' },
          phone_number: null,
          status: 'active',
          is_default: true,
          external_ref: null,
          associated_users: [],
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-05T00:00:00.000Z',
        },
        {
          id: 'wh-2',
          tenant_id: 'tenant-1',
          location_id: 'loc-2',
          name: 'South Warehouse',
          address: { city: 'Chennai', state: 'TN' },
          phone_number: null,
          status: 'active',
          is_default: false,
          external_ref: null,
          associated_users: [],
          created_at: '2026-07-02T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
      ],
    };
    dbResponses['app.locations'] = {
      data: [
        { id: 'loc-1', name: 'North Hub' },
        { id: 'loc-2', name: 'South Hub' },
      ],
    };
    dbResponses['app.metrics_warehouse_period_summary'] = {
      data: [
        {
          warehouse_id: 'wh-1',
          sold_sku_count: 3,
          sold_units: 12,
          invoice_value: 25000,
        },
      ],
    };
    dbResponses['app.tenant_inventory'] = {
      data: [
        { warehouse_id: 'wh-1', tenant_product_id: 'tp-1', qty_available: 4, reorder_point: 5 },
        { warehouse_id: 'wh-1', tenant_product_id: 'tp-2', qty_available: 0, reorder_point: 2 },
        { warehouse_id: 'wh-2', tenant_product_id: 'tp-3', qty_available: 10, reorder_point: 2 },
      ],
    };
  });

  it('returns all warehouses by default and zero-fills missing V4 rows', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/landing?limit=25'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.warehouses).toHaveLength(2);
    expect(body.warehouses[0]).toEqual(expect.objectContaining({
      id: 'wh-1',
      linked_location_name: 'North Hub',
      invoice_value: 25000,
      sold_sku_count: 3,
      sold_units: 12,
      sellable_units: 4,
      stock_status: 'out_of_stock',
    }));
    expect(body.warehouses[1]).toEqual(expect.objectContaining({
      id: 'wh-2',
      invoice_value: 0,
      sold_sku_count: 0,
      sold_units: 0,
      sellable_units: 10,
      stock_status: 'clear',
    }));
    expect(body.period_key).toBe('this_quarter');
    expect(body.grain).toBe('quarter');
    expect(body.filters.groups.map((group: { key: string }) => group.key)).toEqual(['status', 'stock']);
    expect(rpcCalls).toEqual([]);
    expect(queriesByKey['app.metrics_warehouse_period_summary'][0].eq).toHaveBeenCalledWith('grain', 'quarter');
    expect(queriesByKey['app.metrics_warehouse_period_summary'][0].in).toHaveBeenCalledWith('warehouse_id', ['wh-1', 'wh-2']);
  });

  it('filters search and stock posture without V2 RPCs', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/landing?search=north&stock=low_stock&limit=25'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.warehouses).toHaveLength(1);
    expect(body.warehouses[0].id).toBe('wh-1');
    expect(rpcCalls).toEqual([]);
  });

  it('applies no-sales KPI preset as visible-equivalent filters', async () => {
    const preset = encodeURIComponent(JSON.stringify({ not_sold_period: 'this_quarter', stock_gt: 0 }));
    const response = await GET(new NextRequest(`http://localhost/api/tenant/warehouses/landing?filter_preset=${preset}&limit=25`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.warehouses).toHaveLength(1);
    expect(body.warehouses[0].id).toBe('wh-2');
    expect(rpcCalls).toEqual([]);
  });

  it('uses keyset cursors for pagination', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/landing?limit=1'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.warehouses).toHaveLength(1);
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it('blocks seller assistants because warehouses is an admin-only setup module', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/landing?limit=1'));
    expect(response.status).toBe(403);
    expect(rpcCalls).toEqual([]);
  });
});
