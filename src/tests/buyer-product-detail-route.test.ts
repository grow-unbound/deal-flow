import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireBuyerAccessProfileMock = vi.fn();
const resolveBuyerProductScopeContextMock = vi.fn();
const assembleBuyerCatalogItemsForProductIdsMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/buyer-product-data', () => ({
  resolveBuyerProductScopeContext: (...args: unknown[]) => resolveBuyerProductScopeContextMock(...args),
}));

vi.mock('@/lib/server/buyer-assemble-catalog-items', () => ({
  assembleBuyerCatalogItemsForProductIds: (...args: unknown[]) =>
    assembleBuyerCatalogItemsForProductIdsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    tenant_product_id: PRODUCT_ID,
    campaign_id: null,
    campaign_name: null,
    campaign_valid_until: null,
    internal_sku: 'SKU-1',
    display_name: 'Test Cam',
    brand_id: null,
    brand_name: 'Hikvision',
    category_id: null,
    category_name: 'Cameras',
    mrp: 12000,
    price: 9999,
    resolved_price: 9999,
    campaign_price: null,
    has_campaign_price: false,
    gst_rate: 18,
    default_uom: 'pcs',
    pack_size: 1,
    image_urls: [],
    stock_status: 'available' as const,
    on_hand: 12,
    ...overrides,
  };
}

describe('GET /api/buyer/products/[id]', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    resolveBuyerProductScopeContextMock.mockReset();
    assembleBuyerCatalogItemsForProductIdsMock.mockReset();
  });

  it('returns 401 when unauthorized', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(null);
    const { GET } = await import('../../app/api/buyer/products/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/buyer/products/${PRODUCT_ID}`),
      { params: Promise.resolve({ id: PRODUCT_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid uuid', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1' },
    });
    const { GET } = await import('../../app/api/buyer/products/[id]/route');
    const response = await GET(
      new NextRequest('http://localhost/api/buyer/products/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(400);
  });

  it('returns 404 when product is missing', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1' },
    });
    resolveBuyerProductScopeContextMock.mockResolvedValue({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      inventoryWarehouseId: 'wh-1',
      allowedTenantBrandIds: null,
      guestPricing: null,
    });
    assembleBuyerCatalogItemsForProductIdsMock.mockResolvedValue(new Map());

    const { GET } = await import('../../app/api/buyer/products/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/buyer/products/${PRODUCT_ID}`),
      { params: Promise.resolve({ id: PRODUCT_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns a single item via scope context + assemble (not catalog list)', async () => {
    const item = makeItem();
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1' },
    });
    resolveBuyerProductScopeContextMock.mockResolvedValue({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      inventoryWarehouseId: 'wh-1',
      allowedTenantBrandIds: ['brand-1'],
      guestPricing: null,
    });
    assembleBuyerCatalogItemsForProductIdsMock.mockResolvedValue(new Map([[PRODUCT_ID, item]]));

    const { GET } = await import('../../app/api/buyer/products/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/buyer/products/${PRODUCT_ID}`),
      { params: Promise.resolve({ id: PRODUCT_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.item).toEqual(item);
    expect(assembleBuyerCatalogItemsForProductIdsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        productIds: [PRODUCT_ID],
        allowedTenantBrandIds: ['brand-1'],
        inventoryWarehouseId: 'wh-1',
        campaignId: null,
        campaignName: null,
        campaignValidUntil: null,
      }),
    );
  });

  it('preserves campaign price fields for strikethrough UI', async () => {
    const item = makeItem({
      price: 8499,
      campaign_price: 8499,
      resolved_price: 9999,
      has_campaign_price: true,
      campaign_id: 'camp-1',
      campaign_name: 'Summer Deal',
      campaign_valid_until: '2026-12-31T00:00:00.000Z',
    });
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1' },
      buyer: { id: 'buyer-1' },
    });
    resolveBuyerProductScopeContextMock.mockResolvedValue({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      inventoryWarehouseId: 'wh-1',
      allowedTenantBrandIds: null,
      guestPricing: null,
    });
    assembleBuyerCatalogItemsForProductIdsMock.mockResolvedValue(new Map([[PRODUCT_ID, item]]));

    const { GET } = await import('../../app/api/buyer/products/[id]/route');
    const response = await GET(
      new NextRequest(`http://localhost/api/buyer/products/${PRODUCT_ID}`),
      { params: Promise.resolve({ id: PRODUCT_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.item.price).toBe(8499);
    expect(body.item.resolved_price).toBe(9999);
    expect(body.item.has_campaign_price).toBe(true);
    expect(body.item.campaign_id).toBe('camp-1');
    expect(body.item.campaign_valid_until).toBe('2026-12-31T00:00:00.000Z');
  });
});
