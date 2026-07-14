import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({ rpc: rpcMock })),
  },
}));

import { GET } from '../../../app/api/products/search/route';

describe('master product search route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    rpcMock.mockReset();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
  });

  it('delegates search and imported-product exclusion to the bounded catalog RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{
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
        brand_name: 'Vinikus',
        brand_slug: 'vinikus',
        brand_logo_url: null,
        category_name: 'Cables',
      }],
      error: null,
    });

    const response = await GET(new NextRequest('http://localhost/api/products/search?q=cable', { method: 'GET' }) as any);
    const body = (await response.json()) as { products: Array<{ id: string; name: string }> };

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('search_available_products_for_tenant', {
      p_tenant_id: 'tenant-a',
      p_query: 'cable',
      p_limit: 20,
    });
    expect(body.products).toEqual([expect.objectContaining({ id: 'm-2', name: 'Fresh Cable' })]);
  });
});
