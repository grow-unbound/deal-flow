import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

const state: {
  importedMasterIds: Array<{ master_product_id: string | null }>;
  catalogProducts: Array<{ id: string; name: string; master_sku: string; brand_id: string; gst_rate: number | null; hsn_code: string | null; default_uom: string | null; pack_size: number | null; description: string | null; image_urls: string[] | null; brands: { id: string; name: string; slug: string; logo_url: string | null } | null; categories: { name: string } | null }>;
  excludedIds: string[];
} = {
  importedMasterIds: [],
  catalogProducts: [],
  excludedIds: [],
};

class QueryBuilder {
  table: string;

  constructor(table: string) {
    this.table = table;
  }

  select() { return this; }
  eq() { return this; }
  is() { return this; }
  limit() { return this; }
  or() { return this; }
  not(_column: string, _operator: string, value: string) {
    if (typeof value !== 'string') {
      return this;
    }
    const ids = value.replace(/[()"]/g, '').split(',').map((id) => id.trim()).filter(Boolean);
    state.excludedIds = ids;
    return this;
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    if (this.table === 'tenant_products') {
      return Promise.resolve(resolve({ data: state.importedMasterIds, error: null }));
    }
    if (this.table === 'products') {
      const rows = state.catalogProducts.filter((row) => !state.excludedIds.includes(row.id));
      return Promise.resolve(resolve({ data: rows, error: null }));
    }
    return Promise.resolve(resolve({ data: null, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: (table: string) => new QueryBuilder(table),
    })),
  },
}));

import { GET } from '../../../app/api/products/search/route';

describe('master product search route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    state.importedMasterIds = [];
    state.catalogProducts = [];
    state.excludedIds = [];
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
  });

  it('filters out master products already imported into the tenant', async () => {
    state.importedMasterIds = [{ master_product_id: 'm-1' }];
    state.catalogProducts = [
      {
        id: 'm-1',
        name: 'Imported Cable',
        master_sku: 'SKU-IMPORTED',
        brand_id: 'brand-1',
        gst_rate: 18,
        hsn_code: '8544',
        default_uom: 'box',
        pack_size: 10,
        description: null,
        image_urls: null,
        brands: { id: 'brand-1', name: 'Vinikus', slug: 'vinikus', logo_url: null },
        categories: { name: 'Cables' },
      },
      {
        id: 'm-2',
        name: 'Fresh Cable',
        master_sku: 'SKU-FRESH',
        brand_id: 'brand-1',
        gst_rate: 18,
        hsn_code: '8544',
        default_uom: 'box',
        pack_size: 10,
        description: null,
        image_urls: null,
        brands: { id: 'brand-1', name: 'Vinikus', slug: 'vinikus', logo_url: null },
        categories: { name: 'Cables' },
      },
    ];

    const response = await GET(new NextRequest('http://localhost/api/products/search?q=cable', { method: 'GET' }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(state.excludedIds).toEqual(['m-1']);
    expect(body.products).toHaveLength(1);
    expect(body.products[0].id).toBe('m-2');
    expect(body.products[0].name).toBe('Fresh Cable');
  });
});
