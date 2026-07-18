import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BUYER_CACHE_CATALOG, BUYER_CACHE_PERSONAL } from '@/lib/server/buyer-cache-headers';

const mocks = vi.hoisted(() => ({
  requireBuyerAccessProfile: vi.fn(),
  resolveBuyerAllowedTenantBrandIds: vi.fn(),
  searchScopedProducts: vi.fn(),
  orderDeletedIs: vi.fn(),
}));

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: mocks.requireBuyerAccessProfile,
}));

vi.mock('@/lib/server/buyer-brand-visibility', () => ({
  resolveBuyerAllowedTenantBrandIds: mocks.resolveBuyerAllowedTenantBrandIds,
}));

vi.mock('@/lib/server/scoped-product-search', () => ({
  searchScopedProducts: mocks.searchScopedProducts,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: mocks.orderDeletedIs.mockImplementation(() => ({
                  ilike: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: table === 'orders'
                        ? [{ id: 'order-1', order_number: 'SO-100', status: 'received', total_amount: 1200 }]
                        : [],
                    })),
                  })),
                })),
              })),
            })),
          })),
        };
      }),
    })),
  },
  supabase: null,
}));

import { GET } from '../../app/api/buyer/search/route';

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe('buyer search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireBuyerAccessProfile.mockResolvedValue({
      context: { tenant_id: 'tenant-1', buyer_id: 'buyer-1', mode: 'buyer' },
    });
  });

  it('privately caches empty catalog and order searches by scope', async () => {
    const catalogResponse = await GET(request('/api/buyer/search?scope=catalog'));
    const ordersResponse = await GET(request('/api/buyer/search?scope=orders'));

    expect(catalogResponse.headers.get('Cache-Control')).toBe(BUYER_CACHE_CATALOG['Cache-Control']);
    expect(ordersResponse.headers.get('Cache-Control')).toBe(BUYER_CACHE_PERSONAL['Cache-Control']);
  });

  it('excludes deleted orders and privately caches successful order results', async () => {
    const response = await GET(request('/api/buyer/search?scope=orders&q=SO-100'));

    expect(response.status).toBe(200);
    expect(mocks.orderDeletedIs).toHaveBeenCalledWith('deleted_at', null);
    expect(response.headers.get('Cache-Control')).toBe(BUYER_CACHE_PERSONAL['Cache-Control']);
  });

  it('privately caches successful catalog results', async () => {
    mocks.resolveBuyerAllowedTenantBrandIds.mockResolvedValue(['brand-1']);
    mocks.searchScopedProducts.mockResolvedValue({
      rows: [{ tenant_product_id: 'product-1', product_name: 'Camera', sku: 'CAM-1' }],
    });

    const response = await GET(request('/api/buyer/search?scope=catalog&q=camera'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(BUYER_CACHE_CATALOG['Cache-Control']);
  });

  it('does not cache error responses', async () => {
    mocks.requireBuyerAccessProfile.mockResolvedValue(null);

    const response = await GET(request('/api/buyer/search?scope=catalog&q=camera'));

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBeNull();
  });
});
