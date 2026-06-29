import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const resolveImportedProductTenantLinksMock = vi.fn();

const state = {
  existingSkuRow: null as null | Record<string, unknown>,
  currentProduct: null as null | Record<string, unknown>,
  insertedProductPayload: null as null | Record<string, unknown>,
  updatedProductPayload: null as null | Record<string, unknown>,
  auditLogPayload: null as null | Record<string, unknown>,
};

class QueryBuilder {
  table: string;
  action: 'select' | 'insert' | 'update' = 'select';
  filters: Record<string, unknown> = {};
  payload: Record<string, unknown> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  is() {
    return this;
  }

  in() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  textSearch() {
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.action = 'insert';
    this.payload = payload;
    if (this.table === 'tenant_products') state.insertedProductPayload = payload;
    if (this.table === 'audit_log') state.auditLogPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.action = 'update';
    this.payload = payload;
    state.updatedProductPayload = payload;
    return this;
  }

  maybeSingle() {
    if (this.table === 'tenant_products' && this.filters.internal_sku) {
      return Promise.resolve({ data: state.existingSkuRow, error: null });
    }
    if (this.table === 'tenant_products' && this.filters.id) {
      return Promise.resolve({ data: state.currentProduct, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table === 'tenant_products' && this.action === 'insert') {
      return Promise.resolve({ data: { id: 'tenant-product-1', ...this.payload }, error: null });
    }
    if (this.table === 'tenant_products' && this.action === 'update') {
      return Promise.resolve({ data: { ...state.currentProduct, ...this.payload }, error: null });
    }
    return Promise.resolve({ data: { id: `${this.table}-1`, ...this.payload }, error: null });
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    return Promise.resolve(resolve({ data: null, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/tenant-product-source-resolution', () => ({
  resolveImportedProductTenantLinks: (...args: unknown[]) => resolveImportedProductTenantLinksMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => new QueryBuilder(table)),
    })),
  },
}));

import { PATCH } from '../../../app/api/tenant/products/[id]/route';
import { POST } from '../../../app/api/tenant/products/route';

describe('POST /api/tenant/products', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    resolveImportedProductTenantLinksMock.mockReset();
    state.existingSkuRow = null;
    state.insertedProductPayload = null;
  });

  it('uses resolved tenant brand/category ids when importing a master product', async () => {
    resolveImportedProductTenantLinksMock.mockResolvedValue({
      tenant_brand_id: 'tenant-brand-1',
      tenant_category_id: 'tenant-category-1',
    });

    const request = new Request('http://localhost/api/tenant/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_product_id: '11111111-1111-4111-8111-111111111111',
        internal_sku: 'SKU-1',
        name: 'Imported Product',
        mrp: 100,
        base_selling_price: 90,
      }),
    });

    const response = await POST(request as any);
    const body = await response.json() as any;

    expect(response.status).toBe(201);
    expect(body.product.tenant_brand_id).toBe('tenant-brand-1');
    expect(body.product.tenant_category_id).toBe('tenant-category-1');
    expect(state.insertedProductPayload).toMatchObject({
      tenant_id: 'tenant-1',
      tenant_brand_id: 'tenant-brand-1',
      tenant_category_id: 'tenant-category-1',
      created_by: 'user-1',
      updated_by: 'user-1',
    });
    expect(resolveImportedProductTenantLinksMock).toHaveBeenCalledWith(
      expect.any(Object),
      'tenant-1',
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      {
        tenant_brand_id: null,
        tenant_category_id: null,
      },
    );
  });
});

describe('PATCH /api/tenant/products/[id]', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    resolveImportedProductTenantLinksMock.mockReset();
    state.currentProduct = {
      id: 'product-1',
      tenant_id: 'tenant-1',
      tenant_brand_id: null,
      tenant_category_id: null,
      master_product_id: '22222222-2222-4222-8222-222222222222',
      internal_sku: 'SKU-1',
      name_override: 'Imported Product',
      mrp: 100,
      base_selling_price: 90,
      cost_price: null,
      default_uom: null,
      pack_size: null,
      hsn_code: null,
      gst_rate: null,
      description: null,
      attributes_override: {},
      image_urls: [],
      is_active: true,
      external_ref: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.updatedProductPayload = null;
  });

  it('backfills tenant brand/category for imported products during edit', async () => {
    resolveImportedProductTenantLinksMock.mockResolvedValue({
      tenant_brand_id: 'tenant-brand-1',
      tenant_category_id: 'tenant-category-1',
    });

    const request = new Request('http://localhost/api/tenant/products/product-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_override: 'Updated Product' }),
    });

    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: 'product-1' }),
    });
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.product.name_override).toBe('Updated Product');
    expect(state.updatedProductPayload).toMatchObject({
      name_override: 'Updated Product',
      tenant_brand_id: 'tenant-brand-1',
      tenant_category_id: 'tenant-category-1',
    });
    expect(resolveImportedProductTenantLinksMock).toHaveBeenCalled();
  });

  it('does not attempt catalog backfill for a custom product edit', async () => {
    state.currentProduct = {
      ...state.currentProduct,
      master_product_id: null,
      tenant_brand_id: 'tenant-brand-existing',
      tenant_category_id: 'tenant-category-existing',
    };

    const request = new Request('http://localhost/api/tenant/products/product-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_override: 'Custom Product' }),
    });

    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: 'product-1' }),
    });

    expect(response.status).toBe(200);
    expect(resolveImportedProductTenantLinksMock).not.toHaveBeenCalled();
    expect(state.updatedProductPayload).toMatchObject({
      name_override: 'Custom Product',
    });
  });
});
