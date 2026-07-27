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

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null })),
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);

  return query;
}

const dbResponses: Record<string, QueryResult> = {};

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(dbResponses[`${schemaName}.${tableName}`] ?? {})),
  })),
  rpc: vi.fn((fnName: string) =>
    Promise.resolve(dbResponses[`${schemaName}.rpc.${fnName}`] ?? { data: { row_metrics: [] }, error: null }),
  ),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/products/[id]/route';

const baseProduct = {
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
};

describe('GET /api/tenant/products/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.tenant_products'] = { data: baseProduct };
    dbResponses['app.rpc.get_seller_product_detail_v2'] = {
      data: {
        header: { title: 'Alpha Cable' },
        kpi_grid: [
          { label: 'Available', value: 30 },
          { label: 'Units sold 90D', value: 20 },
          { label: 'Invoiced sales 90D', value: 2000 },
          { label: 'Days cover', value: 14 },
        ],
      },
    };
    dbResponses['catalog.products'] = { data: null };
    dbResponses['app.tenant_brands'] = { data: { id: 'brand-1', display_name_override: 'Alpha', master_brand_id: null } };
    dbResponses['app.tenant_categories'] = { data: { id: 'category-1', name: 'Cables' } };
    dbResponses['app.price_lists'] = { data: [] };
    dbResponses['app.price_list_items'] = { data: [] };
  });

  it('returns pricing rows for every tenant price list with joined list price when present', async () => {
    dbResponses['app.price_lists'] = {
      data: [
        {
          id: 'pl-1',
          name: 'Retail',
          valid_from: null,
          valid_to: null,
          is_active: true,
          external_ref: null,
          priority: 1,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'pl-2',
          name: 'Wholesale',
          valid_from: null,
          valid_to: null,
          is_active: true,
          external_ref: 'zoho-1',
          priority: 2,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    dbResponses['app.price_list_items'] = {
      data: [{ id: 'item-1', price_list_id: 'pl-1', price: 95 }],
    };
    dbResponses['app.rpc.get_seller_price_list_landing_aggregates'] = {
      data: {
        row_metrics: [
          { id: 'pl-1', avg_discount_pct: 12.5, avg_margin_pct: 22 },
          { id: 'pl-2', avg_discount_pct: null, avg_margin_pct: null },
        ],
      },
    };

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/products/product-1?include_performance=false'),
      { params: Promise.resolve({ id: 'product-1' }) },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.detail.pricing).toHaveLength(2);
    expect(body.detail.pricing[0]).toMatchObject({
      price_list_id: 'pl-1',
      price_list_name: 'Retail',
      item_id: 'item-1',
      list_price: 95,
      is_managed_externally: false,
      status: 'active',
      avg_discount_pct: 12.5,
      avg_margin_pct: 22,
    });
    expect(body.detail.pricing[1]).toMatchObject({
      price_list_id: 'pl-2',
      price_list_name: 'Wholesale',
      item_id: null,
      list_price: null,
      is_managed_externally: true,
    });
  });

  it('returns empty pricing when pricing engine flag is off', async () => {
    getFlagMock.mockResolvedValue(false);
    dbResponses['app.price_lists'] = {
      data: [{ id: 'pl-1', name: 'Retail', valid_from: null, valid_to: null, is_active: true, external_ref: null, priority: 1 }],
    };

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/products/product-1?include_performance=false'),
      { params: Promise.resolve({ id: 'product-1' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.detail.pricing).toEqual([]);
  });
});
