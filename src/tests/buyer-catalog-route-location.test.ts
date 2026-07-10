import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireBuyerAccessProfileMock = vi.fn();
const resolveBuyerCatalogContextMock = vi.fn();
const fetchBuyerCatalogPageMock = vi.fn();
const enrichBuyerProductsMock = vi.fn();
const getSelectedBuyerDeliveryFromRequestMock = vi.fn();
const resolveNearestBuyerLocationMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/buyer-product-data', () => ({
  resolveBuyerCatalogContext: (...args: unknown[]) => resolveBuyerCatalogContextMock(...args),
  fetchBuyerCatalogPage: (...args: unknown[]) => fetchBuyerCatalogPageMock(...args),
  enrichBuyerProducts: (...args: unknown[]) => enrichBuyerProductsMock(...args),
}));

vi.mock('@/lib/server/buyer-location-selection', () => ({
  getSelectedBuyerDeliveryFromRequest: (...args: unknown[]) => getSelectedBuyerDeliveryFromRequestMock(...args),
}));

vi.mock('@/lib/server/buyer-routing', () => ({
  resolveNearestBuyerLocation: (...args: unknown[]) => resolveNearestBuyerLocationMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      from: vi.fn((tableName: string) => {
        if (schemaName === 'app' && tableName === 'campaigns') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: 'camp-1',
                        name: 'Launch Catalog',
                        tenant_id: 'tenant-1',
                        status: 'published',
                        valid_to: null,
                      },
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          };
        }

        if (schemaName === 'app' && tableName === 'campaign_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: [{ tenant_product_id: 'tp-1', price_override: null, display_order: 1, is_featured: false }],
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected query: ${schemaName}.${tableName}`);
      }),
    })),
  },
}));

describe('buyer catalog routes use selected location for stock', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    resolveBuyerCatalogContextMock.mockReset();
    fetchBuyerCatalogPageMock.mockReset();
    enrichBuyerProductsMock.mockReset();
    getSelectedBuyerDeliveryFromRequestMock.mockReset();
    resolveNearestBuyerLocationMock.mockReset();
  });

  it('passes nearest inventory warehouse into the shared catalog page resolver', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: null,
    });
    resolveBuyerCatalogContextMock.mockResolvedValue({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      inventoryWarehouseId: 'loc-nearest',
      allowedTenantBrandIds: null,
      visibleCampaigns: [],
      catalogs: [],
    });
    fetchBuyerCatalogPageMock.mockResolvedValue({
      items: [],
      total: 0,
      has_more: false,
      selected_campaign_id: null,
      selected_campaign_name: null,
      selected_campaign_valid_until: null,
      selected_campaign_message: null,
    });

    const { GET } = await import('../../app/api/buyer/catalog/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/catalog?limit=48&offset=0'));

    expect(response.status).toBe(200);
    expect(fetchBuyerCatalogPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryWarehouseId: 'loc-nearest' }),
    );
  });

  it('uses the fallback default warehouse for share-token stock enrichment', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: null,
    });
    getSelectedBuyerDeliveryFromRequestMock.mockReturnValue({ label: 'Remote Area', city: 'Pune', lat: 18.5, lng: 73.8 });
    resolveNearestBuyerLocationMock.mockResolvedValue({ warehouseId: 'loc-default', locationName: 'Default Warehouse', distanceKm: null, fallback: true });
    enrichBuyerProductsMock.mockResolvedValue(new Map([
      ['tp-1', {
        id: 'tp-1',
        tenant_product_id: 'tp-1',
        campaign_id: 'camp-1',
        campaign_name: 'Launch Catalog',
        campaign_valid_until: null,
        internal_sku: 'SKU-1',
        display_name: 'Bullet Camera',
        brand_id: 'brand-1',
        brand_name: 'CP Plus',
        category_id: 'cat-1',
        category_name: 'CCTV',
        mrp: 5000,
        price: 4200,
        resolved_price: 4200,
        default_uom: 'pc',
        pack_size: 1,
        image_urls: [],
        stock_status: 'out_of_stock',
        on_hand: 0,
        is_featured: false,
      }],
    ]));

    const { GET } = await import('../../app/api/buyer/catalog/[share_token]/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/catalog/tok'), {
      params: Promise.resolve({ share_token: 'tok' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(enrichBuyerProductsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inventoryWarehouseId: 'loc-default' }),
    );
    expect(body.items[0].stock_status).toBe('out_of_stock');
  });
});
