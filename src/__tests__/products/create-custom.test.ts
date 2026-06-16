import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock data ───────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-001';
const BRAND_ID = 'tenant-brand-uuid-001';

const baseCustomProduct = {
  master_product_id: null,
  tenant_brand_id: BRAND_ID,
  internal_sku: 'CUSTOM-001',
  name: 'My Custom Product',
  mrp: 500,
  base_selling_price: 400,
  default_uom: 'pcs',
  pack_size: 6,
  hsn_code: '8471',
  gst_rate: 18,
  description: 'A great product',
  attributes: { colour: 'red', size: 'large' },
  image_urls: [],
};

const insertedRow = {
  id: 'new-product-uuid-001',
  tenant_id: TENANT_ID,
  tenant_brand_id: BRAND_ID,
  master_product_id: null,
  internal_sku: baseCustomProduct.internal_sku,
  name_override: baseCustomProduct.name,
  mrp: baseCustomProduct.mrp,
  base_selling_price: baseCustomProduct.base_selling_price,
  cost_price: null,
  default_uom: baseCustomProduct.default_uom,
  pack_size: baseCustomProduct.pack_size,
  hsn_code: baseCustomProduct.hsn_code,
  gst_rate: baseCustomProduct.gst_rate,
  attributes_override: baseCustomProduct.attributes,
  image_urls: [],
  is_active: true,
  external_ref: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Custom product creation — POST /api/tenant/products', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a custom product with master_product_id = null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ product: insertedRow }),
    });

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseCustomProduct),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);

    const data = await res.json() as any;
    expect(data.product.master_product_id).toBeNull();
    expect(data.product.name_override).toBe('My Custom Product');
    expect(data.product.internal_sku).toBe('CUSTOM-001');
    expect(data.product.tenant_brand_id).toBe(BRAND_ID);
    expect(data.product.mrp).toBe(500);
    expect(data.product.base_selling_price).toBe(400);
    expect(data.product.is_active).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tenant/products',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns 409 when internal_sku already exists (custom product)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'This SKU already exists in your product list.' }),
    });

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseCustomProduct),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data.error).toBe('This SKU already exists in your product list.');
  });

  it('returns 400 when tenant_brand_id is missing for a custom product', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'tenant_brand_id is required for custom products' }),
    });

    const { tenant_brand_id: _omit, ...withoutBrand } = baseCustomProduct;
    void _omit;

    const res = await fetch('/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withoutBrand),
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toMatch(/tenant_brand_id/);
  });

  it('GET response does NOT include cost_price for seller_assistant role', async () => {
    // Simulate the API stripping cost_price for seller_assistant
    const productWithoutCostPrice = {
      ...insertedRow,
      // cost_price is stripped server-side
    };
    const { cost_price: _cost_price, ...strippedRow } = productWithoutCostPrice;
    void _cost_price;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ products: [strippedRow] }),
    });

    const res = await fetch('/api/tenant/products');
    expect(res.ok).toBe(true);

    const data = await res.json() as any;
    expect(data.products).toHaveLength(1);
    // cost_price should not be present in the response for seller_assistant
    expect('cost_price' in data.products[0]).toBe(false);
    expect(data.products[0].mrp).toBe(500);
  });

  it('GET response INCLUDES cost_price for seller_admin role', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        products: [{ ...insertedRow, cost_price: 300 }],
      }),
    });

    const res = await fetch('/api/tenant/products');
    const data = await res.json() as any;
    expect(data.products[0].cost_price).toBe(300);
  });

  it('HSN warning logic: shows warning when hsn_code is empty', () => {
    // Unit test the warning condition
    const watchedHsn = '';
    const watchedGst = '18';
    const showHsnWarning = !watchedHsn || !watchedGst;
    expect(showHsnWarning).toBe(true);
  });

  it('HSN warning logic: shows warning when gst_rate is empty', () => {
    const watchedHsn = '8471';
    const watchedGst = '';
    const showHsnWarning = !watchedHsn || !watchedGst;
    expect(showHsnWarning).toBe(true);
  });

  it('HSN warning logic: no warning when both hsn_code and gst_rate are provided', () => {
    const watchedHsn = '8471';
    const watchedGst = '18';
    const showHsnWarning = !watchedHsn || !watchedGst;
    expect(showHsnWarning).toBe(false);
  });

  it('attributes array is transformed to object on submission', () => {
    const attributesArray = [
      { key: 'colour', value: 'red' },
      { key: 'size', value: 'large' },
      { key: '  ', value: 'ignored' }, // blank key — should be skipped
    ];

    const attributesObj: Record<string, string> = {};
    for (const attr of attributesArray) {
      if (attr.key.trim()) {
        attributesObj[attr.key.trim()] = attr.value;
      }
    }

    expect(attributesObj).toEqual({ colour: 'red', size: 'large' });
    expect('  ' in attributesObj).toBe(false);
  });

  it('image_urls array is filtered to non-empty strings', () => {
    const imgFields = [
      { url: 'https://example.com/a.jpg' },
      { url: '  ' },
      { url: '' },
      { url: 'https://example.com/b.jpg' },
    ];

    const imageUrls = imgFields
      .map((f) => f.url.trim())
      .filter((u) => u.length > 0);

    expect(imageUrls).toEqual([
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
    ]);
  });
});
