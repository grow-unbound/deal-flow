import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveImportedProductTenantLinks } from '@/lib/server/tenant-product-source-resolution';

type TableName = 'products' | 'tenant_brands' | 'tenant_categories';

function matchesFilters(row: Record<string, unknown>, filters: Array<{ op: 'eq' | 'in' | 'is'; column: string; value: unknown }>) {
  return filters.every((filter) => {
    const value = (row as Record<string, unknown>)[filter.column];
    if (filter.op === 'eq') return value === filter.value;
    if (filter.op === 'is') return filter.value === null ? value == null : value === filter.value;
    if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
    return false;
  });
}

function createMockDb() {
  const state = {
    catalogProduct: null as null | Record<string, unknown>,
    tenantBrands: [] as Array<Record<string, unknown>>,
    tenantCategories: [] as Array<Record<string, unknown>>,
    insertedBrands: [] as Array<Record<string, unknown>>,
    insertedCategories: [] as Array<Record<string, unknown>>,
  };

  class QueryBuilder {
    table: TableName | 'other';
    action: 'select' | 'insert' = 'select';
    payload: Record<string, unknown> | null = null;
    filters: Array<{ op: 'eq' | 'in' | 'is'; column: string; value: unknown }> = [];

    constructor(table: TableName | 'other') {
      this.table = table;
    }

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ op: 'eq', column, value });
      return this;
    }

    in(column: string, value: unknown) {
      this.filters.push({ op: 'in', column, value });
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.push({ op: 'is', column, value });
      return this;
    }

    insert(payload: Record<string, unknown>) {
      this.action = 'insert';
      this.payload = payload;
      return this;
    }

    maybeSingle() {
      const row = this.resolveSingleRow();
      return Promise.resolve({ data: row, error: null });
    }

    single() {
      if (this.action === 'insert' && this.payload) {
        const created = this.createRow(this.payload);
        return Promise.resolve({ data: created, error: null });
      }
      return Promise.resolve({ data: this.resolveSingleRow(), error: null });
    }

    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: this.resolveSingleRow(), error: null }));
    }

    private resolveSingleRow() {
      if (this.table === 'products') {
        return state.catalogProduct;
      }
      if (this.table === 'tenant_brands') {
        return state.tenantBrands.find((row) => matchesFilters(row, this.filters)) ?? null;
      }
      if (this.table === 'tenant_categories') {
        return state.tenantCategories.find((row) => matchesFilters(row, this.filters)) ?? null;
      }
      return null;
    }

    private createRow(payload: Record<string, unknown>) {
      if (this.table === 'tenant_brands') {
        const row = { id: `brand-${state.insertedBrands.length + 1}`, ...payload };
        state.insertedBrands.push(row);
        state.tenantBrands.push(row);
        return row;
      }
      if (this.table === 'tenant_categories') {
        const row = { id: `category-${state.insertedCategories.length + 1}`, ...payload };
        state.insertedCategories.push(row);
        state.tenantCategories.push(row);
        return row;
      }
      return { id: 'noop' };
    }
  }

  const db = {
    schema: vi.fn(() => ({
      from: vi.fn((table: TableName | 'other') => new QueryBuilder(table)),
    })),
  };

  return { db, state };
}

describe('resolveImportedProductTenantLinks', () => {
  const tenantId = 'tenant-1';
  const actorId = 'user-1';
  const masterProductId = 'product-1';

  it('reuses tenant rows already linked by master id', async () => {
    const { db, state } = createMockDb();
    state.catalogProduct = {
      id: masterProductId,
      brand_id: 'brand-1',
      category_id: 'category-1',
      brands: { id: 'brand-1', name: 'Alpha Brand', slug: 'alpha-brand' },
      categories: { id: 'category-1', name: 'Alpha Category', slug: 'alpha-category' },
    };
    state.tenantBrands = [
      { id: 'tenant-brand-1', tenant_id: tenantId, master_brand_id: 'brand-1', slug: 'alpha-brand', deleted_at: null },
    ];
    state.tenantCategories = [
      { id: 'tenant-category-1', tenant_id: tenantId, master_category_id: 'category-1', slug: 'alpha-category', deleted_at: null },
    ];

    const links = await resolveImportedProductTenantLinks(db as any, tenantId, actorId, masterProductId);

    expect(links).toEqual({
      tenant_brand_id: 'tenant-brand-1',
      tenant_category_id: 'tenant-category-1',
    });
    expect(state.insertedBrands).toHaveLength(0);
    expect(state.insertedCategories).toHaveLength(0);
  });

  it('falls back to slug when master links are missing', async () => {
    const { db, state } = createMockDb();
    state.catalogProduct = {
      id: masterProductId,
      brand_id: 'brand-1',
      category_id: 'category-1',
      brands: { id: 'brand-1', name: 'Alpha Brand', slug: 'alpha-brand' },
      categories: { id: 'category-1', name: 'Alpha Category', slug: 'alpha-category' },
    };
    state.tenantBrands = [
      { id: 'tenant-brand-7', tenant_id: tenantId, master_brand_id: null, slug: 'alpha-brand', deleted_at: null },
    ];
    state.tenantCategories = [
      { id: 'tenant-category-7', tenant_id: tenantId, master_category_id: null, slug: 'alpha-category', deleted_at: null },
    ];

    const links = await resolveImportedProductTenantLinks(db as any, tenantId, actorId, masterProductId);

    expect(links).toEqual({
      tenant_brand_id: 'tenant-brand-7',
      tenant_category_id: 'tenant-category-7',
    });
    expect(state.insertedBrands).toHaveLength(0);
    expect(state.insertedCategories).toHaveLength(0);
  });

  it('creates missing tenant brand and category and links them to catalog sources', async () => {
    const { db, state } = createMockDb();
    state.catalogProduct = {
      id: masterProductId,
      brand_id: 'brand-1',
      category_id: 'category-1',
      brands: { id: 'brand-1', name: 'Alpha Brand', slug: 'alpha-brand' },
      categories: { id: 'category-1', name: 'Alpha Category', slug: 'alpha-category' },
    };

    const links = await resolveImportedProductTenantLinks(db as any, tenantId, actorId, masterProductId);

    expect(links?.tenant_brand_id).toBe('brand-1');
    expect(links?.tenant_category_id).toBe('category-1');
    expect(state.insertedBrands[0]).toMatchObject({
      tenant_id: tenantId,
      master_brand_id: 'brand-1',
      display_name_override: 'Alpha Brand',
      slug: 'alpha-brand',
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    });
    expect(state.insertedCategories[0]).toMatchObject({
      tenant_id: tenantId,
      master_category_id: 'category-1',
      name: 'Alpha Category',
      slug: 'alpha-category',
      review_status: 'draft',
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    });
  });

  it('creates only the missing side when the other tenant row already exists', async () => {
    const { db, state } = createMockDb();
    state.catalogProduct = {
      id: masterProductId,
      brand_id: 'brand-1',
      category_id: 'category-1',
      brands: { id: 'brand-1', name: 'Alpha Brand', slug: 'alpha-brand' },
      categories: { id: 'category-1', name: 'Alpha Category', slug: 'alpha-category' },
    };
    state.tenantBrands = [
      { id: 'tenant-brand-1', tenant_id: tenantId, master_brand_id: 'brand-1', slug: 'alpha-brand', deleted_at: null },
    ];

    const links = await resolveImportedProductTenantLinks(db as any, tenantId, actorId, masterProductId);

    expect(links).toEqual({
      tenant_brand_id: 'tenant-brand-1',
      tenant_category_id: 'category-1',
    });
    expect(state.insertedBrands).toHaveLength(0);
    expect(state.insertedCategories[0]).toMatchObject({
      master_category_id: 'category-1',
      slug: 'alpha-category',
    });
  });
});
