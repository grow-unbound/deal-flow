import { beforeEach, describe, expect, it, vi } from 'vitest';

const createProductQueryEmbeddingMock = vi.fn();

vi.mock('@/lib/server/product-search', () => ({
  createProductQueryEmbedding: (...args: unknown[]) => createProductQueryEmbeddingMock(...args),
}));

import { searchScopedProducts } from '@/lib/server/scoped-product-search';

describe('searchScopedProducts', () => {
  beforeEach(() => {
    createProductQueryEmbeddingMock.mockReset();
  });

  it('treats an explicitly empty allowed-brand scope as deny-all', async () => {
    const rpc = vi.fn();
    const result = await searchScopedProducts({
      db: { schema: () => ({ rpc }) } as any,
      tenantId: 'tenant-a',
      query: 'cable',
      limit: 20,
      allowedBrandIds: [],
    });

    expect(result).toEqual({ rows: [], total: 0 });
    expect(createProductQueryEmbeddingMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pushes campaign membership into the scoped product RPC', async () => {
    createProductQueryEmbeddingMock.mockResolvedValue(null);
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await searchScopedProducts({
      db: { schema: () => ({ rpc }) } as any,
      tenantId: 'tenant-a',
      campaignId: 'campaign-a',
      query: 'camera',
      limit: 20,
      offset: 40,
    });

    expect(rpc).toHaveBeenCalledWith('search_products_scoped', expect.objectContaining({
      p_tenant_id: 'tenant-a',
      p_campaign_id: 'campaign-a',
      p_offset: 40,
    }));
  });

  it('keeps buyer category scope scalar at the shared SQL seam', async () => {
    createProductQueryEmbeddingMock.mockResolvedValue(null);
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await searchScopedProducts({
      db: { schema: () => ({ rpc }) } as any,
      tenantId: 'tenant-a',
      categoryScopeId: 'master-category-a',
      limit: 20,
    });

    expect(rpc).toHaveBeenCalledWith('search_products_scoped', expect.objectContaining({
      p_category_scope_id: 'master-category-a',
      p_category_ids: null,
      p_ids: null,
    }));
  });

  it('recovers a stable total for an empty later page with one bounded probe', async () => {
    createProductQueryEmbeddingMock.mockResolvedValue(null);
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ total_count: 73 }], error: null });

    const result = await searchScopedProducts({
      db: { schema: () => ({ rpc }) } as any,
      tenantId: 'tenant-a',
      limit: 20,
      offset: 80,
    });

    expect(result).toEqual({ rows: [], total: 73 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'search_products_scoped', expect.objectContaining({
      p_limit: 1,
      p_offset: 0,
    }));
  });
});
