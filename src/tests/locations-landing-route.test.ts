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
    gte: vi.fn(),
    lt: vi.fn(),
    or: vi.fn(),
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
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.or.mockReturnValue(query);
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

import { GET } from '../../app/api/tenant/locations/landing/route';

describe('GET /api/tenant/locations/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });

    dbResponses['app.locations'] = {
      data: [
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
      ],
    };

    dbResponses['app.locations_snapshot'] = {
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
    };

    dbResponses['app.kpi_location_daily'] = {
      data: [
        { location_id: 'loc-1', gmv: 100000, orders_count: 3 },
        { location_id: 'loc-2', gmv: 50000, orders_count: 1 },
      ],
    };

    dbResponses['app.orders'] = {
      data: [
        { location_id: 'loc-1', buyer_id: 'buyer-1' },
        { location_id: 'loc-1', buyer_id: 'buyer-2' },
      ],
    };

    dbResponses['app.estimates'] = { data: [] };
    dbResponses['app.invoices'] = { data: [] };
  });

  it('keeps KPI and callout totals tenant-wide when search filters the visible rows', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/locations/landing?search=beta'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].name).toBe('Beta Hub');
    expect(body.kpis.active_locations).toBe(2);
    expect(body.kpis.top_location_name).toBe('Alpha Hub');
    expect(body.callouts.top_locations[0]?.name).toBe('Alpha Hub');
  });
});
