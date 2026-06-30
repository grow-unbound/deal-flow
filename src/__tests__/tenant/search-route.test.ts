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
    rpc: (...args: unknown[]) => rpcMock(...args),
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
          url_path: '/products',
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
  });
});
