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

import { GET } from '../../app/api/tenant/products/[id]/route';

describe('GET /api/tenant/products/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
    });

    dbResponses['app.tenant_products'] = [
      { data: { id: 'product-1', tenant_id: 'tenant-1' } },
      {
        data: {
          id: 'product-1',
          tenant_id: 'tenant-1',
          tenant_brand_id: 'brand-1',
          master_product_id: null,
          internal_sku: 'SKU-1',
          name_override: 'Alpha Cable',
          mrp: 150,
          base_selling_price: 100,
          cost_price: 60,
          default_uom: 'pcs',
          pack_size: 1,
          tenant_category_id: 'category-1',
          hsn_code: null,
          gst_rate: null,
          description: null,
          attributes_override: null,
          image_urls: [],
          is_active: true,
          external_ref: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
      },
    ];
    dbResponses['catalog.products'] = [{ data: null }];
    dbResponses['app.tenant_brands'] = [{ data: { id: 'brand-1', display_name_override: 'Alpha', master_brand_id: null } }];
    dbResponses['app.tenant_categories'] = [{ data: { id: 'category-1', name: 'Cables' } }];
    dbResponses['app.tenant_inventory'] = [{ data: [{ id: 'inv-1', qty_available: 30, updated_at: '2026-07-01T00:00:00Z' }] }];
    dbResponses['app.kpi_product_daily'] = [
      { data: [{ units_sold: 20, revenue: 2000 }] },
      { data: [{ units_sold: 10 }] },
      { data: [{ units_sold: 15, revenue: 1500 }] },
      { data: [{ day: '2026-07-01', units_sold: 20, revenue: 2000 }] },
    ];
    dbResponses['app.audit_log'] = [{ data: [] }];
    dbResponses['app.price_lists'] = [{ data: [] }];
    dbResponses['app.price_list_items'] = [{ data: [] }];
    dbResponses['app.price_list_assignments'] = [{ data: [] }];
    dbResponses['app.cohorts'] = [{ data: [] }];
    dbResponses['app.buyers'] = [{ data: [{ id: 'buyer-1', business_name: 'Buyer One', geography: { city: 'Pune' } }] }];
    dbResponses['app.order_items'] = [{ data: [{ order_id: 'order-1', tenant_product_id: 'product-1', qty: 5, line_total: 500, unit_price: 100 }] }];
    dbResponses['app.invoices'] = [{ data: [] }];
    dbResponses['app.orders'] = [{ data: [{ id: 'order-1', status: 'placed', placed_at: '2026-07-08T00:00:00Z', buyer_id: 'buyer-1' }] }];
    dbResponses['app.invoice_items'] = [{ data: [] }];
  });

  it('keeps days_cover null when invoice velocity is unavailable and reads units from KPI rows', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/products/product-1'), {
      params: Promise.resolve({ id: 'product-1' }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.detail.meta_strip_4.units_mtd).toBe(20);
    expect(body.detail.meta_strip_4.days_cover).toBeNull();
    expect(body.detail.header.status_label).toBe('Insufficient velocity');
  });
});
