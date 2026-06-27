import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerDeliverySelectionMock = vi.fn();

vi.mock('@/lib/server/buyer-location-selection', () => ({
  requireBuyerDeliverySelection: (...args: unknown[]) => requireBuyerDeliverySelectionMock(...args),
}));

describe('buyer catalog location gating', () => {
  beforeEach(() => {
    requireBuyerDeliverySelectionMock.mockReset();
    requireBuyerDeliverySelectionMock.mockResolvedValue({
      place_id: 'place-1',
      label: 'Andheri West',
      formatted_address: 'Andheri West, Mumbai',
      city: 'Mumbai',
      lat: 19.12,
      lng: 72.84,
    });
  });

  it('gates catalog page using the full return path', async () => {
    const mod = await import('../../app/(buyer)/buy/catalog/page');
    await mod.default({
      searchParams: Promise.resolve({
        share_token: 'tok',
        buyer_preview: 'preview-token',
      }),
    });

    expect(requireBuyerDeliverySelectionMock).toHaveBeenCalledWith('/buy/catalog?share_token=tok&buyer_preview=preview-token');
  });

  it('gates catalog search only for catalog scope', async () => {
    const mod = await import('../../app/(buyer)/buy/search/page');
    await mod.default({
      searchParams: Promise.resolve({
        scope: 'catalog',
        q: 'camera',
        brand_id: 'brand-1',
      }),
    });

    expect(requireBuyerDeliverySelectionMock).toHaveBeenCalledWith('/buy/search?scope=catalog&q=camera&brand_id=brand-1');
  });
});
