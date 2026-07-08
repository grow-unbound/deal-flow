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
    maybeSingle: vi.fn(),
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
  query.maybeSingle.mockReturnValue(query);
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

import { GET } from '../../app/api/tenant/categories/landing/route';

describe('GET /api/tenant/categories/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        { tenant_product_id: 'product-1', qty_available: 8, reorder_point: 2, location_id: 'loc-1' },
      ],
    };
    dbResponses['app.kpi_product_daily'] = {
      data: [],
    };
  });

  it('returns null avg_days_cover when no recent invoice velocity exists', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].avg_days_cover).toBeNull();
  });
});
