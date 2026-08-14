import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const rpcMock = vi.fn();
const state: { supabaseAdmin: { schema: ReturnType<typeof vi.fn> } | null } = {
  supabaseAdmin: { schema: vi.fn() },
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  get supabaseAdmin() {
    return state.supabaseAdmin;
  },
}));

import { GET } from '../../../../app/api/tenant/products/search/route';

describe('tenant product search route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getFlagMock.mockReset();
    rpcMock.mockReset();
    state.supabaseAdmin = { schema: vi.fn(() => ({ rpc: rpcMock })) };
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    rpcMock.mockResolvedValue({
      data: [
        {
          tenant_product_id: 'tp-1',
          product_name: 'Alpha Cable',
          sku: 'SKU-1',
          brand_name: 'Vinikus',
          category_name: 'Cables',
          hsn_code: '8544',
          tax_pct: 18,
          on_hand: 12,
          unit_price: 1250,
          mrp: 1500,
          base_selling_price: 1200,
          default_uom: 'box',
          pack_size: 10,
        },
      ],
      error: null,
    });
  });

  it('maps composer search rows with no embedding param sent to the rpc', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/products/search?q=alpha', { method: 'GET' }) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('search_products_scoped', expect.objectContaining({
      p_tenant_id: 'tenant-a',
      p_query: 'alpha',
      p_buyer_id: null,
      p_price_list_id: null,
      p_limit: 16,
      p_ids: null,
    }));
    const [, calledArgs] = rpcMock.mock.calls[0];
    expect(calledArgs).not.toHaveProperty('p_query_embedding');
    expect(body.products).toEqual([
      expect.objectContaining({
        tenant_product_id: 'tp-1',
        product_name: 'Alpha Cable',
        sku: 'SKU-1',
        brand_name: 'Vinikus',
        brand_initials: 'V',
        hsn_code: '8544',
        unit_price: 1250,
      }),
    ]);
  });

  it.each([
    'not-a-uuid',
    Array.from({ length: 101 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`).join(','),
  ])('rejects malformed or oversized ids input before searching', async (ids) => {
    const response = await GET(new NextRequest(
      `http://localhost/api/tenant/products/search?ids=${encodeURIComponent(ids)}`,
      { method: 'GET' },
    ) as any);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid product ids' });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
