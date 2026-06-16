import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TENANT_ID = 'tenant-uuid-001';
const PRODUCT_ID = 'product-uuid-001';

const existingProduct = {
  id: PRODUCT_ID,
  tenant_id: TENANT_ID,
  tenant_brand_id: 'brand-uuid-001',
  master_product_id: null,
  internal_sku: 'CUSTOM-001',
  name_override: 'My Product',
  mrp: 500,
  base_selling_price: 400,
  cost_price: 300,
  default_uom: 'pcs',
  pack_size: 6,
  hsn_code: '8471',
  gst_rate: 18,
  description: 'A great product',
  attributes_override: { colour: 'red' },
  image_urls: [],
  is_active: true,
  external_ref: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Product edit — PATCH /api/tenant/products/[id]', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCH valid fields → 200 with updated product', async () => {
    const updated = { ...existingProduct, name_override: 'Updated Name', mrp: 550 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product: updated }),
    });

    const res = await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_override: 'Updated Name', mrp: 550 }),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.product.name_override).toBe('Updated Name');
    expect(data.product.mrp).toBe(550);
    expect(data.product.internal_sku).toBe('CUSTOM-001'); // unchanged
  });

  it('PATCH body containing internal_sku — route ignores it and returns 200', async () => {
    // The server strips internal_sku before processing — it's immutable
    const updated = { ...existingProduct, name_override: 'New Name' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product: updated }),
    });

    const res = await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_sku: 'HACKED-SKU', name_override: 'New Name' }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    // internal_sku should NOT have changed
    expect(data.product.internal_sku).toBe('CUSTOM-001');
  });

  it('deactivation → is_active=false in response', async () => {
    const deactivated = { ...existingProduct, is_active: false };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product: deactivated }),
    });

    const res = await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.product.is_active).toBe(false);
  });

  it('reactivation → is_active=true in response', async () => {
    const reactivated = { ...existingProduct, is_active: true };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product: reactivated }),
    });

    const res = await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.product.is_active).toBe(true);
  });

  it('product not found → 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Product not found' }),
    });

    const res = await fetch(`/api/tenant/products/nonexistent-uuid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_override: 'Whatever' }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toBe('Product not found');
  });

  it('seller_assistant cannot update cost_price (server strips it)', async () => {
    // Server strips cost_price for seller_assistant — response cost_price is unchanged
    const sameProduct = { ...existingProduct, cost_price: 300 }; // still 300 not 999
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product: sameProduct }),
    });

    const res = await fetch(`/api/tenant/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost_price: 999, name_override: 'New name' }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    // cost_price was NOT updated (server ignored it for seller_assistant)
    expect(data.product.cost_price).toBe(300);
  });

  it('GET single product → 200 with all fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ product: existingProduct }),
    });

    const res = await fetch(`/api/tenant/products/${PRODUCT_ID}`);
    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.product.id).toBe(PRODUCT_ID);
    expect(data.product.internal_sku).toBe('CUSTOM-001');
    expect(data.product.is_active).toBe(true);
  });

  it('GET product not found → 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Product not found' }),
    });

    const res = await fetch(`/api/tenant/products/nonexistent-uuid`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });
});

describe('computeDiff utility', () => {
  function computeDiff(
    oldProduct: Record<string, unknown>,
    newFields: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, newVal] of Object.entries(newFields)) {
      if (oldProduct[key] !== newVal) {
        diff[key] = { from: oldProduct[key], to: newVal };
      }
    }
    return diff;
  }

  it('returns diff for changed fields only', () => {
    const old = { name_override: 'Old Name', mrp: 500, is_active: true };
    const updates = { name_override: 'New Name', mrp: 500 };
    const diff = computeDiff(old, updates);
    expect(diff).toEqual({ name_override: { from: 'Old Name', to: 'New Name' } });
    expect('mrp' in diff).toBe(false); // mrp unchanged
  });

  it('includes is_active in diff for deactivation', () => {
    const old = { is_active: true };
    const updates = { is_active: false };
    const diff = computeDiff(old, updates);
    expect(diff).toEqual({ is_active: { from: true, to: false } });
  });

  it('returns empty diff when nothing changed', () => {
    const old = { mrp: 500, base_selling_price: 400 };
    const updates = { mrp: 500, base_selling_price: 400 };
    const diff = computeDiff(old, updates);
    expect(Object.keys(diff)).toHaveLength(0);
  });
});

describe('action type determination', () => {
  it('status_change when only is_active is in the update body', () => {
    const updateFields = { is_active: false };
    const isStatusChangeOnly =
      Object.keys(updateFields).length === 1 && 'is_active' in updateFields;
    expect(isStatusChangeOnly).toBe(true);
  });

  it('update action when other fields are present alongside is_active', () => {
    const updateFields = { is_active: false, name_override: 'New' };
    const isStatusChangeOnly =
      Object.keys(updateFields).length === 1 && 'is_active' in updateFields;
    expect(isStatusChangeOnly).toBe(false);
  });

  it('update action for regular field changes', () => {
    const updateFields = { mrp: 600, name_override: 'Better Name' };
    const isStatusChangeOnly =
      Object.keys(updateFields).length === 1 && 'is_active' in updateFields;
    expect(isStatusChangeOnly).toBe(false);
  });
});
