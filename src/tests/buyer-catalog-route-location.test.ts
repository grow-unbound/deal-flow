import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const assembleBuyerCatalogItemsForProductIdsMock = vi.fn();
const requireBuyerAccessProfileMock = vi.fn();
const getVisibleBuyerCatalogsMock = vi.fn();
const resolveBuyerAllowedTenantBrandIdsMock = vi.fn();
const getSelectedBuyerDeliveryFromRequestMock = vi.fn();
const resolveNearestBuyerLocationMock = vi.fn();

vi.mock('@/lib/server/buyer-assemble-catalog-items', () => ({
  assembleBuyerCatalogItemsForProductIds: (...args: unknown[]) => assembleBuyerCatalogItemsForProductIdsMock(...args),
}));

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
  getVisibleBuyerCatalogs: (...args: unknown[]) => getVisibleBuyerCatalogsMock(...args),
}));

vi.mock('@/lib/server/buyer-brand-visibility', () => ({
  resolveBuyerAllowedTenantBrandIds: (...args: unknown[]) => resolveBuyerAllowedTenantBrandIdsMock(...args),
}));

vi.mock('@/lib/server/buyer-location-selection', () => ({
  getSelectedBuyerDeliveryFromRequest: (...args: unknown[]) => getSelectedBuyerDeliveryFromRequestMock(...args),
}));

vi.mock('@/lib/server/buyer-routing', () => ({
  resolveNearestBuyerLocation: (...args: unknown[]) => resolveNearestBuyerLocationMock(...args),
}));

const appSchemaMock = vi.fn((tableName: string) => {
  if (tableName === 'tenant_products') {
    return {
      select: vi.fn(() => {
        const chain: Record<string, any> = {
          eq: vi.fn(() => chain),
          is: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => chain),
          or: vi.fn(() => chain),
          then: undefined,
        };
        chain.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [{ id: 'tp-1', tenant_brand_id: 'tb-1', master_product_id: 'mp-1', is_active: true }], error: null }));
        return chain;
      }),
    };
  }

  if (tableName === 'campaigns') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              or: vi.fn(() => ({
                order: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        })),
      })),
    };
  }

  if (tableName === 'campaign_items') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    };
  }

  throw new Error(`Unexpected app table ${tableName}`);
});

const shareTokenAppSchemaMock = vi.fn((tableName: string) => {
  if (tableName === 'campaigns') {
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

  if (tableName === 'campaign_items') {
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

  if (tableName === 'tenant_products') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({
            data: [{
              id: 'tp-1',
              internal_sku: 'SKU-1',
              name_override: 'Bullet Camera',
              tenant_brand_id: 'tb-1',
              master_product_id: 'mp-1',
              mrp: 5000,
              base_selling_price: 4200,
              default_uom: 'pc',
              pack_size: 1,
              image_urls: [],
            }],
            error: null,
          })),
        })),
      })),
    };
  }

  if (tableName === 'tenant_brands') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({
            data: [{ id: 'tb-1', display_name_override: null, master_brand_id: 'brand-1', logo_url: null }],
            error: null,
          })),
        })),
      })),
    };
  }

  if (tableName === 'tenant_inventory') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(() => ({
            eq: vi.fn(async (_field: string, locationId: string) => ({
              data: locationId === 'loc-default'
                ? [{ tenant_product_id: 'tp-1', qty_available: 0, location_id: 'loc-default' }]
                : [{ tenant_product_id: 'tp-1', qty_available: 2, location_id: 'loc-nearest' }],
            })),
          })),
        })),
      })),
    };
  }

  throw new Error(`Unexpected share-token app table ${tableName}`);
});

const catalogSchemaMock = vi.fn((tableName: string) => {
  if (tableName === 'brands') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({
            data: [{ id: 'brand-1', name: 'CP Plus', logo_url: null }],
            error: null,
          })),
        })),
      })),
    };
  }

  if (tableName === 'products') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({
            data: [{ id: 'mp-1', category_id: 'cat-1', image_urls: [] }],
            error: null,
          })),
        })),
      })),
    };
  }

  if (tableName === 'categories') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({
            data: [{ id: 'cat-1', name: 'CCTV', image_url: null }],
            error: null,
          })),
        })),
      })),
    };
  }

  throw new Error(`Unexpected catalog table ${tableName}`);
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      from: schemaName === 'catalog' ? catalogSchemaMock : appSchemaMock,
      rpc: vi.fn(async () => ({ data: 4200 })),
    })),
  },
}));

describe('buyer catalog routes use selected location for stock', () => {
  beforeEach(() => {
    assembleBuyerCatalogItemsForProductIdsMock.mockReset();
    requireBuyerAccessProfileMock.mockReset();
    getVisibleBuyerCatalogsMock.mockReset();
    resolveBuyerAllowedTenantBrandIdsMock.mockReset();
    getSelectedBuyerDeliveryFromRequestMock.mockReset();
    resolveNearestBuyerLocationMock.mockReset();
    appSchemaMock.mockClear();
    shareTokenAppSchemaMock.mockClear();
    catalogSchemaMock.mockClear();
  });

  it('passes nearest inventory location into the main catalog assembler', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1' },
    });
    getVisibleBuyerCatalogsMock.mockResolvedValue([]);
    resolveBuyerAllowedTenantBrandIdsMock.mockResolvedValue(null);
    getSelectedBuyerDeliveryFromRequestMock.mockReturnValue({ label: 'Andheri West', city: 'Mumbai', lat: 19.1, lng: 72.8 });
    resolveNearestBuyerLocationMock.mockResolvedValue({ locationId: 'loc-nearest', locationName: 'Mumbai Warehouse', distanceKm: 4, fallback: false });
    assembleBuyerCatalogItemsForProductIdsMock.mockResolvedValue(new Map([
      ['tp-1', {
        id: 'tp-1',
        tenant_product_id: 'tp-1',
        campaign_id: null,
        campaign_name: null,
        campaign_valid_until: null,
        internal_sku: 'SKU-1',
        display_name: 'Bullet Camera',
        brand_id: 'brand-1',
        brand_name: 'CP Plus',
        category_id: 'cat-1',
        category_name: 'CCTV',
        mrp: 5000,
        price: 4200,
        default_uom: 'pc',
        pack_size: 1,
        image_urls: [],
        stock_status: 'limited',
        on_hand: 2,
      }],
    ]));

    const { GET } = await import('../../app/api/buyer/catalog/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/catalog?limit=48&offset=0'));
    expect(response.status).toBe(200);
    expect(assembleBuyerCatalogItemsForProductIdsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inventoryLocationId: 'loc-nearest' }),
    );
  });

  it('uses the fallback default location for share-token stock when nearest warehouse misses threshold', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1' },
    });
    getSelectedBuyerDeliveryFromRequestMock.mockReturnValue({ label: 'Remote Area', city: 'Pune', lat: 18.5, lng: 73.8 });
    resolveNearestBuyerLocationMock.mockResolvedValue({ locationId: 'loc-default', locationName: 'Default Warehouse', distanceKm: null, fallback: true });

    const { supabaseAdmin } = await import('@/lib/supabase');
    (supabaseAdmin.schema as any).mockImplementation((schemaName: string) => ({
      from: schemaName === 'catalog' ? catalogSchemaMock : shareTokenAppSchemaMock,
      rpc: vi.fn(async () => ({ data: 4200 })),
    }));

    const { GET } = await import('../../app/api/buyer/catalog/[share_token]/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/catalog/tok'), {
      params: Promise.resolve({ share_token: 'tok' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].on_hand).toBe(0);
    expect(body.items[0].stock_status).toBe('out_of_stock');
  });
});
