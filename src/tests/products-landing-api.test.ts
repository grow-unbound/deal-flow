import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

const dbResponses: Record<string, QueryResult[]> = {};
const productRpcRows = [
  {
    id: 'product-active',
    tenant_id: 'tenant-1',
    tenant_brand_id: 'brand-active',
    tenant_category_id: 'category-active',
    master_product_id: null,
    internal_sku: 'SKU-A',
    name_override: 'Active Product',
    mrp: 100,
    base_selling_price: 80,
    cost_price: 60,
    default_uom: 'pcs',
    pack_size: 1,
    image_urls: [],
    is_active: true,
    external_ref: null,
    created_at: '2026-06-20T00:00:00Z',
    updated_at: '2026-06-20T00:00:00Z',
    master_product: null,
    display_name: 'Active Product',
    brand_name: 'Brand Active',
    category_name: 'Category Active',
    on_hand: 5,
    days_cover: null,
    units_mtd: 4,
    gmv_mtd: 320,
    growth_pct: 100,
    status_label: 'Insufficient velocity',
    status_tone: 'neutral',
  },
  {
    id: 'product-inactive',
    tenant_id: 'tenant-1',
    tenant_brand_id: 'brand-inactive',
    tenant_category_id: 'category-inactive',
    master_product_id: null,
    internal_sku: 'SKU-I',
    name_override: 'Inactive Product',
    mrp: 120,
    base_selling_price: 90,
    cost_price: 70,
    default_uom: 'pcs',
    pack_size: 1,
    image_urls: [],
    is_active: false,
    external_ref: null,
    created_at: '2026-06-19T00:00:00Z',
    updated_at: '2026-06-19T00:00:00Z',
    master_product: null,
    display_name: 'Inactive Product',
    brand_name: 'Brand Inactive',
    category_name: 'Category Inactive',
    on_hand: 0,
    days_cover: 0,
    units_mtd: 0,
    gmv_mtd: 0,
    growth_pct: 0,
    status_label: 'Out of stock',
    status_tone: 'danger',
  },
];

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
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    neq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    textSearch: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.textSearch.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);

  return query;
}

const fromMock = vi.fn((schemaName: string, tableName: string) => ({
  select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
}));
const rpcMock = vi.fn(async (name: string, args?: { p_statuses?: string[] | null }) => {
  if (name !== 'metrics_v2_products_landing') return { data: null, error: null };
  const statuses = args?.p_statuses ?? [];
  const products = productRpcRows.filter((row) => {
    if (statuses.length === 0) return true;
    return statuses.some((status) => (status === 'Active' ? row.is_active : !row.is_active));
  });
  return {
    data: {
      as_of: '2026-07-16T00:00:00.000Z',
      table_period_owner: 'none',
      headline_period: 'trailing_90_days',
      action_period: 'now',
      commercial_horizon_days: 90,
      products,
      total: products.length,
      nextCursor: null,
      filters: {
        groups: [
          { key: 'brand', label: 'Brand', options: [{ value: 'Brand Active', label: 'Brand Active' }] },
          { key: 'category', label: 'Category', options: [{ value: 'Category Active', label: 'Category Active' }] },
          { key: 'status', label: 'Status', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }] },
          { key: 'stock', label: 'Stock', options: [{ value: 'In stock', label: 'In stock' }, { value: 'Low stock', label: 'Low stock' }, { value: 'Out of stock', label: 'Out of stock' }] },
        ],
      },
      kpis: {
        total_skus: 2,
        active_skus: 1,
        archived_skus: 1,
        out_of_stock: 1,
        low_stock: 0,
        units_mtd: 4,
        revenue_mtd: 320,
        revenue_prev_mtd: 0,
        revenue_growth_pct: 100,
      },
      todays_read: {
        needs_attention: [],
        top_performers: [],
        top_risers: [],
      },
    },
    error: null,
  };
});
const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => fromMock(schemaName, tableName)),
  rpc: rpcMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/products/route';

describe('products landing api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });

    dbResponses['app.tenant_products'] = [
      {
        data: [
          {
            id: 'product-active',
            tenant_id: 'tenant-1',
            tenant_brand_id: 'brand-active',
            tenant_category_id: 'category-active',
            master_product_id: null,
            internal_sku: 'SKU-A',
            name_override: 'Active Product',
            mrp: 100,
            base_selling_price: 80,
            cost_price: 60,
            default_uom: 'pcs',
            pack_size: 1,
            image_urls: [],
            is_active: true,
            external_ref: null,
            created_at: '2026-06-20T00:00:00Z',
            updated_at: '2026-06-20T00:00:00Z',
          },
          {
            id: 'product-inactive',
            tenant_id: 'tenant-1',
            tenant_brand_id: 'brand-inactive',
            tenant_category_id: 'category-inactive',
            master_product_id: null,
            internal_sku: 'SKU-I',
            name_override: 'Inactive Product',
            mrp: 120,
            base_selling_price: 90,
            cost_price: 70,
            default_uom: 'pcs',
            pack_size: 1,
            image_urls: [],
            is_active: false,
            external_ref: null,
            created_at: '2026-06-19T00:00:00Z',
            updated_at: '2026-06-19T00:00:00Z',
          },
        ],
      },
      {
        data: [
          {
            id: 'product-active',
            tenant_brand_id: 'brand-active',
            master_product_id: null,
            internal_sku: 'SKU-A',
            name_override: 'Active Product',
            image_urls: [],
            is_active: true,
          },
          {
            id: 'product-inactive',
            tenant_brand_id: 'brand-inactive',
            master_product_id: null,
            internal_sku: 'SKU-I',
            name_override: 'Inactive Product',
            image_urls: [],
            is_active: false,
          },
        ],
      },
    ];

    dbResponses['app.products_snapshot'] = [{ data: { total_count: 2, active_count: 1, low_stock_count: 0 } }];
    dbResponses['app.tenant_brands'] = [
      {
        data: [
          { id: 'brand-active', display_name_override: 'Brand Active', master_brand_id: null, deleted_at: null },
          { id: 'brand-inactive', display_name_override: 'Brand Inactive', master_brand_id: null, deleted_at: null },
        ],
      },
      {
        data: [{ id: 'brand-active', display_name_override: 'Brand Active', master_brand_id: null }],
      },
    ];
    dbResponses['app.tenant_categories'] = [
      {
        data: [
          { id: 'category-active', name: 'Category Active', deleted_at: null },
          { id: 'category-inactive', name: 'Category Inactive', deleted_at: null },
        ],
      },
      {
        data: [{ id: 'category-active', name: 'Category Active' }],
      },
    ];
    dbResponses['app.tenant_inventory'] = [
      {
        data: [
          { tenant_product_id: 'product-active', qty_available: 5, deleted_at: null },
          { tenant_product_id: 'product-inactive', qty_available: 0, deleted_at: null },
        ],
      },
    ];
    dbResponses['app.kpi_product_daily'] = [
      {
        data: [
          { tenant_product_id: 'product-active', units_sold: 4, revenue: 320 },
          { tenant_product_id: 'product-inactive', units_sold: 0, revenue: 0 },
        ],
      },
      {
        data: [
          { tenant_product_id: 'product-active', revenue: 200 },
          { tenant_product_id: 'product-inactive', revenue: 0 },
        ],
      },
    ];
    dbResponses['app.invoices'] = [
      {
        data: [
          { id: 'invoice-1', status: 'paid' },
        ],
      },
    ];
    dbResponses['app.invoice_items'] = [
      {
        data: [
          { invoice_id: 'invoice-1', tenant_product_id: 'product-inactive', qty: 3 },
        ],
      },
    ];
    dbResponses['catalog.products'] = [{ data: [] }];
  });

  it('exposes active filter values and filters rows independently of summary metadata', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/products?period=month&status=Inactive'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.products).toHaveLength(1);
    expect(body.products[0].id).toBe('product-inactive');

    const groups = body.filters.groups as Array<{ key: string; label: string; options: Array<{ value: string }> }>;
    expect(groups.find((group) => group.key === 'brand')?.options).toEqual([
      { value: 'Brand Active', label: 'Brand Active' },
    ]);
    expect(groups.find((group) => group.key === 'category')?.options).toEqual([
      { value: 'Category Active', label: 'Category Active' },
    ]);
    expect(groups.find((group) => group.key === 'status')?.options).toEqual([
      { value: 'Active', label: 'Active' },
      { value: 'Inactive', label: 'Inactive' },
    ]);
    expect(groups.find((group) => group.key === 'stock')?.options).toEqual([
      { value: 'In stock', label: 'In stock' },
      { value: 'Low stock', label: 'Low stock' },
      { value: 'Out of stock', label: 'Out of stock' },
    ]);
    expect(body.kpis.total_skus).toBe(2);
    expect(body.kpis.active_skus).toBe(1);
    expect(body.kpis.out_of_stock).toBe(1);
    expect(body.kpis.units_mtd).toBe(4);
  });

  it('returns null days_cover when velocity is unavailable in the V2 snapshot', async () => {
    dbResponses['app.invoices'] = [{ data: [] }];
    dbResponses['app.invoice_items'] = [{ data: [] }];

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/products?period=month'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    const activeProduct = body.products.find((product: { id: string }) => product.id === 'product-active');
    expect(activeProduct.days_cover).toBeNull();
    expect(activeProduct.status_label).toBe('Insufficient velocity');
  });

  it('uses the bounded V2 products landing RPC instead of V1 product daily and inventory hydration', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/products?period=month'),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('metrics_v2_products_landing', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_limit: expect.any(Number),
    }));
    expect(fromMock).not.toHaveBeenCalledWith('app', 'kpi_product_daily');
    expect(fromMock).not.toHaveBeenCalledWith('app', 'tenant_inventory');
  });
});
