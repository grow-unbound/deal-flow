import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const createProductQueryEmbeddingMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/product-search', () => ({
  createProductQueryEmbedding: (...args: unknown[]) => createProductQueryEmbeddingMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    }),
  },
}));

import { GET } from '../../../app/api/tenant/search/route';

describe('tenant global search route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    createProductQueryEmbeddingMock.mockReset();
    rpcMock.mockReset();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
    createProductQueryEmbeddingMock.mockResolvedValue('[0.9,0.8,0.7]');
    rpcMock.mockResolvedValue({
      data: [
        {
          entity_type: 'product',
          id: 'tp-1',
          label: 'Alpha Cable',
          sublabel: 'Vinikus · SKU-1',
          url_path: '/products/tp-1',
        },
      ],
      error: null,
    });
  });

  it('passes query embeddings into the global search rpc', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/search?q=alpha&limit=3', { method: 'GET' }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(createProductQueryEmbeddingMock).toHaveBeenCalledWith('alpha');
    expect(rpcMock).toHaveBeenCalledWith('global_search', expect.objectContaining({
      p_query: 'alpha',
      p_tenant_id: 'tenant-a',
      p_role: 'seller_admin',
      p_items_per_group: 3,
      p_query_embedding: '[0.9,0.8,0.7]',
    }));
    expect(body.total).toBe(1);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]?.items[0]?.url_path).toBe('/products/tp-1');
  });

  it('groups extended entity types in seller navigation order', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { entity_type: 'warehouse', id: 'wh-1', label: 'Central WH', sublabel: '', url_path: '/warehouses/wh-1' },
        { entity_type: 'campaign', id: 'cmp-1', label: 'Monsoon Push', sublabel: 'live', url_path: '/campaigns/cmp-1' },
        { entity_type: 'category', id: 'cat-1', label: 'Cables', sublabel: 'Active', url_path: '/categories/cat-1' },
        { entity_type: 'cohort', id: 'cg-1', label: 'North Retailers', sublabel: '', url_path: '/customer-groups/cg-1' },
        { entity_type: 'price_list', id: 'pl-1', label: 'North Pricing', sublabel: 'active', url_path: '/price-lists/pl-1' },
        { entity_type: 'product', id: 'tp-1', label: 'Alpha Cable', sublabel: 'Vinikus · SKU-1', url_path: '/products/tp-1' },
        { entity_type: 'brand', id: 'b-1', label: 'Vinikus', sublabel: '', url_path: '/brands/b-1' },
        { entity_type: 'customer', id: 'c-1', label: 'Acme Retail', sublabel: '', url_path: '/customers/c-1' },
        { entity_type: 'order', id: 'o-1', label: 'SO-001', sublabel: '', url_path: '/sales-orders/o-1' },
        { entity_type: 'invoice', id: 'i-1', label: 'INV-001', sublabel: '', url_path: '/invoices/i-1' },
        { entity_type: 'estimate', id: 'e-1', label: 'EST-001', sublabel: '', url_path: '/estimates/e-1' },
        { entity_type: 'location', id: 'loc-1', label: 'Bengaluru', sublabel: '', url_path: '/locations/loc-1' },
      ],
      error: null,
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/search?q=alpha&limit=5', { method: 'GET' }) as any);
    const body = (await response.json()) as any;

    expect(body.groups.map((group: { entity_type: string }) => group.entity_type)).toEqual([
      'product',
      'brand',
      'category',
      'customer',
      'cohort',
      'campaign',
      'price_list',
      'order',
      'invoice',
      'estimate',
      'location',
      'warehouse',
    ]);
  });
});
