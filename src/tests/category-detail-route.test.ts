import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const kpiProductInCalls: unknown[] = [];

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

type QueryResult = { data?: unknown; error?: unknown };
const dbResponses: Record<string, QueryResult[]> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    in: vi.fn((column: string, value: unknown) => {
      if (key === 'app.kpi_product_daily' && column === 'tenant_product_id') {
        kpiProductInCalls.push(value);
      }
      return query;
    }),
    order: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
}));

vi.mock('@/lib/server/request-supabase', () => ({
  getRequestSupabaseClient: () => ({ schema: (...args: unknown[]) => schemaMock(...args) }),
}));

import { GET } from '../../app/api/tenant/categories/[id]/route';

describe('GET /api/tenant/categories/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kpiProductInCalls.length = 0;
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.tenant_categories'] = [
      {
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          tenant_id: 'tenant-1',
          name: 'Cables',
          slug: 'cables',
          description: null,
          is_active: true,
          display_order: 1,
          external_ref: null,
          r2_image_thumb_key: null,
          r2_image_original_key: null,
          r2_image_medium_key: null,
          deleted_at: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
      },
    ];
    dbResponses['app.kpi_category_daily'] = [
      { data: [{ gmv: 500, units_sold: 5, buyers_count: 2 }] },
      { data: [{ gmv: 250 }] },
      { data: [] },
    ];
    dbResponses['app.tenant_products'] = [
      {
        data: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Alpha Cable',
            sku_code: 'SKU-1',
            tenant_brand_id: 'brand-1',
            is_active: true,
            deleted_at: null,
            tenant_brands: { name: 'Alpha' },
            tenant_inventory: [
              { qty_available: 2, reorder_point: 1 },
              { qty_available: 3, reorder_point: 4 },
            ],
          },
        ],
      },
    ];
    dbResponses['app.audit_log'] = [{ data: [] }];
    dbResponses['app.kpi_product_daily'] = [
      { data: [{ tenant_product_id: '22222222-2222-4222-8222-222222222222', units_sold: 4, revenue: 400 }] },
      { data: [{ tenant_product_id: '22222222-2222-4222-8222-222222222222', revenue: 100 }] },
      { data: [{ tenant_product_id: '22222222-2222-4222-8222-222222222222', units_sold: 10 }] },
    ];
  });

  it('scopes product KPI reads to category products and aggregates inventory deterministically', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/categories/11111111-1111-4111-8111-111111111111'), {
      params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(kpiProductInCalls).toEqual([['22222222-2222-4222-8222-222222222222'], ['22222222-2222-4222-8222-222222222222'], ['22222222-2222-4222-8222-222222222222']]);
    expect(body.data.products[0].on_hand).toBe(5);
    expect(body.data.products[0].units_mtd).toBe(4);
    expect(body.data.brands[0].growth_pct).toBe(300);
  });
});
