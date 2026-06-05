import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const revalidateSellerDashboardCacheMock = vi.fn();

const state = {
  cohortExists: true,
  insertedCatalogPayload: null as unknown,
  insertedItemsPayload: null as unknown,
};

class QueryBuilder {
  table: string;
  action: 'select' | 'insert' | 'update' = 'select';
  filters: Record<string, unknown> = {};

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

  in(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  is() {
    return this;
  }

  insert(payload: unknown) {
    this.action = 'insert';
    if (this.table === 'published_catalogs') state.insertedCatalogPayload = payload;
    if (this.table === 'published_catalog_items') state.insertedItemsPayload = payload;
    return this;
  }

  maybeSingle() {
    if (this.table === 'cohorts') {
      return Promise.resolve({ data: state.cohortExists ? { id: 'cohort-1' } : null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table === 'published_catalogs' && this.action === 'insert') {
      return Promise.resolve({ data: { id: 'cat-1', status: 'draft' }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    if (this.table === 'tenant_products') {
      const ids = (this.filters.id as string[]) ?? [];
      return Promise.resolve(resolve({ data: ids.map((id) => ({ id })), error: null }));
    }
    if (this.table === 'published_catalog_items' && this.action === 'insert') {
      return Promise.resolve(resolve({ data: null, error: null }));
    }
    return Promise.resolve(resolve({ data: null, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/dashboard-cache', () => ({
  revalidateSellerDashboardCache: (...args: unknown[]) => revalidateSellerDashboardCacheMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => new QueryBuilder(table)),
    })),
  },
}));

import { POST } from '../../../app/api/tenant/catalogs/route';

describe('POST /api/tenant/catalogs', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    revalidateSellerDashboardCacheMock.mockReset();
    state.cohortExists = true;
    state.insertedCatalogPayload = null;
    state.insertedItemsPayload = null;
  });

  it('creates a draft catalog with cohort scope and selected products', async () => {
    const request = new Request('http://localhost/api/tenant/catalogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Summer New Arrivals',
        scope_type: 'cohort',
        cohort_id: '123e4567-e89b-12d3-a456-426614174000',
        valid_from: '2026-06-01T00:00:00.000Z',
        valid_to: '2026-06-30T00:00:00.000Z',
        filters: {
          brand_names: ['Solar Estates'],
          category_names: ['Red wine'],
          availability: 'show_everything',
        },
        items: [{ tenant_product_id: '223e4567-e89b-12d3-a456-426614174000', display_order: 0 }],
        save_mode: 'draft',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.catalog).toEqual({ id: 'cat-1', status: 'draft' });
    expect(state.insertedCatalogPayload).toMatchObject({
      tenant_id: 'tenant-1',
      name: 'Summer New Arrivals',
      scope_type: 'cohort',
      status: 'draft',
    });
    expect(state.insertedItemsPayload).toEqual([
      expect.objectContaining({
        catalog_id: 'cat-1',
        tenant_product_id: '223e4567-e89b-12d3-a456-426614174000',
        display_order: 0,
      }),
    ]);
    expect(revalidateSellerDashboardCacheMock).toHaveBeenCalledWith('tenant-1');
  });
});
