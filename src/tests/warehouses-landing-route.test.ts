import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  getSellerLocationScope: ({ role, location_ids }: { role?: string | null; location_ids?: string[] | null }) => {
    if (role === 'seller_admin') return { mode: 'all', locationIds: null };
    if (location_ids?.length) return { mode: 'subset', locationIds: location_ids };
    return { mode: 'none', locationIds: [] };
  },
}));

type QueryResult = { data?: unknown; error?: unknown };
const dbResponses: Record<string, QueryResult> = {};

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

import { GET } from '../../app/api/tenant/warehouses/landing/route';

describe('GET /api/tenant/warehouses/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
          lat: null,
          lng: null,
          deleted_at: null,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-05T00:00:00.000Z',
          locations: { id: 'loc-1', name: 'North Hub', is_default: true },
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
          lat: null,
          lng: null,
          deleted_at: null,
          created_at: '2026-07-02T00:00:00.000Z',
          updated_at: '2026-07-04T00:00:00.000Z',
          locations: { id: 'loc-2', name: 'South Hub', is_default: false },
        },
      ],
    };

    dbResponses['app.warehouses_snapshot'] = {
      data: [
        {
          warehouse_id: 'wh-1',
          tracked_skus: 10,
          sellable_units: 100,
          low_stock_skus: 1,
          stockout_skus: 0,
          idle_stock_skus: 2,
          last_inventory_update: '2026-07-05T10:00:00.000Z',
        },
        {
          warehouse_id: 'wh-2',
          tracked_skus: 8,
          sellable_units: 60,
          low_stock_skus: 0,
          stockout_skus: 1,
          idle_stock_skus: 0,
          last_inventory_update: '2026-07-04T10:00:00.000Z',
        },
      ],
    };
  });

  it('keeps KPI totals tenant-wide when the row limit truncates visible warehouses', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/landing?limit=1'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.kpis.active_warehouses).toBe(2);
    expect(body.kpis.tracked_skus).toBe(18);
    expect(body.kpis.low_stock_warehouses).toBe(2);
    expect(body.warehouses).toHaveLength(1);
    expect(body.callouts.stock_attention).toHaveLength(2);
  });
});
