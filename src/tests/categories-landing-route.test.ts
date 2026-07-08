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

type QueryResult = { data?: unknown; error?: unknown };
const dbResponses: Record<string, QueryResult> = {};
const inventoryEqCalls: Array<[string, unknown]> = [];

function createQuery(key: string) {
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      if (key === 'app.tenant_inventory') {
        inventoryEqCalls.push([column, value]);
      }
      return query;
    }),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = dbResponses[key] ?? {};
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
}));

const requestClientMock = { schema: (...args: unknown[]) => schemaMock(...args) };

vi.mock('@/lib/server/request-supabase', () => ({
  getRequestSupabaseClient: () => requestClientMock,
}));

import { GET } from '../../app/api/tenant/categories/landing/route';

describe('GET /api/tenant/categories/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inventoryEqCalls.length = 0;
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.tenant_categories'] = {
      data: [
        { id: 'cat-1', name: 'Cables', slug: 'cables', is_active: true, deleted_at: null, created_at: '2026-07-01T00:00:00.000Z' },
      ],
    };
    dbResponses['app.categories_snapshot'] = {
      data: { active_count: 1, low_stock_count: 0, uncategorized_count: 0 },
    };
    dbResponses['app.kpi_category_daily'] = {
      data: [],
    };
    dbResponses['app.tenant_products'] = {
      data: [
        { id: 'product-1', tenant_category_id: 'cat-1', tenant_brand_id: 'brand-1', is_active: true },
      ],
    };
    dbResponses['app.tenant_inventory'] = {
      data: [
        { tenant_product_id: 'product-1', qty_available: 8, reorder_point: 2 },
      ],
    };
    dbResponses['app.kpi_product_daily'] = {
      data: [],
    };
  });

  it('returns 403 for seller_assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    expect(response.status).toBe(403);
  });

  it('returns null avg_days_cover when no recent invoice velocity exists', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].avg_days_cover).toBeNull();
  });

  it('does not filter tenant_inventory by tenant_id', async () => {
    await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));

    const tenantIdFilters = inventoryEqCalls.filter(([column]) => column === 'tenant_id');
    expect(tenantIdFilters).toHaveLength(0);
  });
});
