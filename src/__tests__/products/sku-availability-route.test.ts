import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

const state: {
  existingProduct: Record<string, unknown> | null;
  updatedQuery: Record<string, unknown>;
} = {
  existingProduct: null,
  updatedQuery: {},
};

class QueryBuilder {
  filters: Record<string, unknown> = {};

  select() { return this; }
  eq(column: string, value: unknown) { this.filters[column] = value; return this; }
  is() { return this; }
  neq(column: string, value: unknown) { this.filters[`neq:${column}`] = value; return this; }
  limit() { return this; }

  maybeSingle() {
    state.updatedQuery = { ...this.filters };
    return Promise.resolve({ data: state.existingProduct, error: null });
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    state.updatedQuery = { ...this.filters };
    return Promise.resolve(resolve({ data: state.existingProduct, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: () => new QueryBuilder(),
    })),
  },
}));

import { GET } from '../../../app/api/tenant/products/sku/route';

describe('tenant product sku availability route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    state.existingProduct = null;
    state.updatedQuery = {};
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
  });

  it('returns unavailable when another tenant product uses the SKU', async () => {
    state.existingProduct = {
      id: 'product-1',
      internal_sku: 'SKU-1',
      name_override: 'Existing Product',
      master_product_id: null,
    };

    const response = await GET(new NextRequest('http://localhost/api/tenant/products/sku?internal_sku=SKU-1', { method: 'GET' }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.duplicate).toBe(true);
    expect(body.product.id).toBe('product-1');
    expect(state.updatedQuery).toMatchObject({
      tenant_id: 'tenant-a',
      internal_sku: 'SKU-1',
    });
  });

  it('excludes the current product id during edit checks', async () => {
    state.existingProduct = null;

    const response = await GET(new NextRequest('http://localhost/api/tenant/products/sku?internal_sku=SKU-2&exclude_id=product-1', { method: 'GET' }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.duplicate).toBe(false);
    expect(state.updatedQuery).toMatchObject({
      tenant_id: 'tenant-a',
      internal_sku: 'SKU-2',
      'neq:id': 'product-1',
    });
  });
});
