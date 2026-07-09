import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

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
    in: vi.fn(() => query),
    neq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    single: vi.fn(() => query),
    then: (onFulfilled: (value: { data: unknown; error: unknown; count: number | null }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      }));
    },
  };

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

import { GET } from '../../app/api/tenant/brands/[id]/route';

describe('GET /api/tenant/brands/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
    });

    dbResponses['app.tenant_brands'] = [
      { data: { id: 'brand-1', tenant_id: 'tenant-1' } },
      {
        data: {
          id: 'brand-1',
          tenant_id: 'tenant-1',
          master_brand_id: null,
          display_name_override: 'Alpha',
          slug: 'alpha',
          description: null,
          logo_url: null,
          margin_pct: 18,
          exclusivity: false,
          is_active: true,
          external_ref: null,
          principal_name: null,
          principal_email: null,
          principal_phone: null,
          principal_location: null,
          contact_name: null,
          contact_email: null,
          contact_phone: null,
          default_cohort_id: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          deleted_at: null,
        },
      },
    ];
    dbResponses['app.tenant_products'] = [
      { data: [{ id: 'product-1', master_product_id: null, internal_sku: 'SKU-1', name_override: 'Alpha Cable', base_selling_price: 100, is_active: true }] },
    ];
    dbResponses['catalog.products'] = [{ data: [] }];
    dbResponses['app.buyers'] = [
      { data: [{ id: 'buyer-1', business_name: 'Buyer One', tier: 'A', is_active: true, geography: { city: 'Pune' }, created_at: '2026-06-01T00:00:00Z' }] },
      { count: 4 },
    ];
    dbResponses['app.tenant_inventory'] = [{ data: [{ tenant_product_id: 'product-1', qty_available: 12, reorder_point: 5 }] }];
    dbResponses['app.campaign_items'] = [{ data: [] }];
    dbResponses['app.audit_log'] = [{ data: [] }];
    dbResponses['app.kpi_brand_daily'] = [
      { data: [{ day: '2026-07-01', gmv: 1000 }] },
      { data: [{ gmv: 400 }] },
      { data: [{ day: '2026-07-01', gmv: 1000 }] },
    ];
    dbResponses['app.kpi_product_daily'] = [{ data: [{ tenant_product_id: 'product-1', units_sold: 6, on_hand: 12 }] }];
    dbResponses['app.order_items'] = [{ data: [{ order_id: 'order-1', tenant_product_id: 'product-1', qty: 2, line_total: 200, unit_price: 100 }] }];
    dbResponses['app.campaigns'] = [{ data: [] }];
    dbResponses['app.orders'] = [{ data: [{ id: 'order-1', buyer_id: 'buyer-1', status: 'placed', placed_at: '2026-07-05T00:00:00Z', campaign_id: null }] }];
  });

  it('uses aggregate GMV for headline metrics while keeping scoped SKU stats', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands/brand-1'), {
      params: Promise.resolve({ id: 'brand-1' }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta_strip_4.gmv_mtd).toBe(1000);
    expect(body.meta_strip_4.growth_pct).toBe(150);
    expect(body.meta_strip_4.total_buyers).toBe(4);
    expect(body.performance.top_skus[0].days_cover).toBe(60);
  });
});
