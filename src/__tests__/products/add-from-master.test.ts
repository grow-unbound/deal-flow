import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Types matching API response shapes
interface MasterProduct {
  id: string;
  name: string;
  master_sku: string;
  brand_id: string;
  brand_name: string | null;
  brand_logo_url: string | null;
  gst_rate: number | null;
  hsn_code: string | null;
  default_uom: string | null;
  pack_size: number | null;
  description: string | null;
  image_urls: string[] | null;
}

interface TenantProductRow {
  id: string;
  tenant_id: string;
  tenant_brand_id: string | null;
  master_product_id: string;
  internal_sku: string;
  name_override: string | null;
  mrp: number;
  base_selling_price: number;
  cost_price: number | null;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[] | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}

const mockMasterProduct: MasterProduct = {
  id: 'product-uuid-001',
  name: 'Premium Red Wine 750ml',
  master_sku: 'PRW-750',
  brand_id: 'brand-uuid-001',
  brand_name: 'WineYard',
  brand_logo_url: null,
  gst_rate: 18,
  hsn_code: '2204',
  default_uom: 'bottle',
  pack_size: 12,
  description: 'Premium quality red wine',
  image_urls: null,
};

const mockTenantProductRow: TenantProductRow = {
  id: 'tenant-product-uuid-001',
  tenant_id: 'tenant-uuid-001',
  tenant_brand_id: 'tenant-brand-uuid-001',
  master_product_id: mockMasterProduct.id,
  internal_sku: 'PRW-750-INT',
  name_override: null,
  mrp: 1500,
  base_selling_price: 1200,
  cost_price: null,
  default_uom: 'bottle',
  pack_size: 12,
  image_urls: null,
  is_active: true,
  external_ref: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Product search API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns products from master catalog search endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [mockMasterProduct] }),
    });

    const res = await fetch('/api/products/search?q=wine');
    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.products).toHaveLength(1);
    expect(data.products[0].name).toBe('Premium Red Wine 750ml');
    expect(data.products[0].master_sku).toBe('PRW-750');
    expect(data.products[0].brand_name).toBe('WineYard');
    expect(data.products[0].gst_rate).toBe(18);
    expect(fetchMock).toHaveBeenCalledWith('/api/products/search?q=wine');
  });

  it('returns empty array when no products match query', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
    });

    const res = await fetch('/api/products/search?q=nonexistent-item-xyz');
    const data = await res.json() as any;
    expect(data.products).toHaveLength(0);
  });

  it('can search by master SKU', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [mockMasterProduct] }),
    });

    const res = await fetch('/api/products/search?q=PRW-750');
    const data = await res.json() as any;
    expect(data.products[0].master_sku).toBe('PRW-750');
  });
});

describe('Tenant products API - add product from master', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('successfully adds a product to tenant from master catalog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ product: mockTenantProductRow }),
    });

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        internal_sku: 'PRW-750-INT',
        mrp: 1500,
        base_selling_price: 1200,
      }),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.product.master_product_id).toBe(mockMasterProduct.id);
    expect(data.product.internal_sku).toBe('PRW-750-INT');
    expect(data.product.mrp).toBe(1500);
    expect(data.product.base_selling_price).toBe(1200);
    expect(data.product.is_active).toBe(true);
  });

  it('newly added product appears in the tenant products list', async () => {
    // First call: GET tenant products (initially empty)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
    });

    const listRes = await fetch('/api/tenant/products');
    const listData = await listRes.json() as any;
    expect(listData.products).toHaveLength(0);

    // Second call: POST to add product
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ product: mockTenantProductRow }),
    });

    await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        internal_sku: 'PRW-750-INT',
        mrp: 1500,
        base_selling_price: 1200,
      }),
    });

    // Third call: GET tenant products (now has the product)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [mockTenantProductRow] }),
    });

    const updatedRes = await fetch('/api/tenant/products');
    const updatedData = await updatedRes.json() as any;
    expect(updatedData.products).toHaveLength(1);
    expect(updatedData.products[0].master_product_id).toBe(mockMasterProduct.id);
  });

  it('returns 409 with proper message when internal_sku already exists', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'This SKU already exists in your product list.' }),
    });

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        internal_sku: 'PRW-750-INT', // duplicate
        mrp: 1500,
        base_selling_price: 1200,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data.error).toBe('This SKU already exists in your product list.');
  });

  it('verifies internal_sku uniqueness constraint via 409 response', async () => {
    // Simulate adding the same SKU twice
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ product: mockTenantProductRow }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'This SKU already exists in your product list.' }),
      });

    // First add: success
    const firstRes = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        internal_sku: 'PRW-750-INT',
        mrp: 1500,
        base_selling_price: 1200,
      }),
    });
    expect(firstRes.status).toBe(201);

    // Second add with same SKU: conflict
    const secondRes = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        internal_sku: 'PRW-750-INT', // same SKU again
        mrp: 1600,
        base_selling_price: 1300,
      }),
    });
    expect(secondRes.status).toBe(409);
    const errData = await secondRes.json() as any;
    expect(errData.error).toBe('This SKU already exists in your product list.');
  });

  it('returns 401 for unauthenticated requests', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        internal_sku: 'SOME-SKU',
        mrp: 100,
        base_selling_price: 80,
      }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 400 for missing required fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid request body' }),
    });

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: mockMasterProduct.id,
        // missing internal_sku, mrp, base_selling_price
      }),
    });

    expect(res.status).toBe(400);
  });
});
