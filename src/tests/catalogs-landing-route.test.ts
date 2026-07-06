import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const brandInFilters: unknown[] = [];

class QueryBuilder {
  table: string;
  schemaName: string;
  filters: Record<string, unknown> = {};

  constructor(schemaName: string, table: string) {
    this.schemaName = schemaName;
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
    if (this.schemaName === 'catalog' && this.table === 'brands' && column === 'id') {
      brandInFilters.push(value);
    }
    return this;
  }

  is() {
    return this;
  }

  not() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    if (this.table === 'campaigns') {
      return Promise.resolve(
        resolve({
          data: [
            {
              id: 'campaign-1',
              name: 'Weekend Push',
              scope_type: 'all',
              scope_value: {},
              valid_from: '2026-07-01T00:00:00.000Z',
              valid_to: null,
              status: 'published',
              created_at: '2026-07-01T00:00:00.000Z',
            },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'campaign_items') {
      return Promise.resolve(
        resolve({
          data: [{ campaign_id: 'campaign-1', tenant_product_id: 'product-1' }],
          error: null,
        }),
      );
    }

    if (this.table === 'tenant_products') {
      return Promise.resolve(
        resolve({
          data: [{ id: 'product-1', tenant_brand_id: 'tenant-brand-1' }],
          error: null,
        }),
      );
    }

    if (this.table === 'tenant_brands') {
      return Promise.resolve(
        resolve({
          data: [{ id: 'tenant-brand-1', display_name_override: 'House Brand', master_brand_id: null }],
          error: null,
        }),
      );
    }

    if (this.schemaName === 'catalog' && this.table === 'brands') {
      return Promise.resolve(resolve({ data: [], error: null }));
    }

    return Promise.resolve(resolve({ data: [], error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      from: vi.fn((table: string) => new QueryBuilder(schemaName, table)),
    })),
  },
}));

import { GET } from '../../app/api/tenant/catalogs/route';

describe('GET /api/tenant/catalogs', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    brandInFilters.length = 0;
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
  });

  it('returns landing data when tenant brands have no master brand id', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/catalogs?period=month'));
    const body = (await response.json()) as { catalogs?: Array<{ id: string }>; error?: string };

    expect(response.status).toBe(200);
    expect(body.catalogs).toHaveLength(1);
    expect(body.catalogs?.[0]?.id).toBe('campaign-1');
    expect(brandInFilters).toHaveLength(0);
  });
});
