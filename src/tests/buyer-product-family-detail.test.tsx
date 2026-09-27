import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const addItemMock = vi.fn();
const updateQtyMock = vi.fn();
const openLoginMock = vi.fn();
const useBuyerProductFamilyDetailMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/buy/family/family-1',
}));

vi.mock('next/image', () => ({
  default: ({ alt = '' }: { alt?: string }) => <img alt={alt} />,
}));

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('@/hooks/useBuyerProducts', () => ({
  useBuyerProductFamilyDetail: (...args: unknown[]) => useBuyerProductFamilyDetailMock(...args),
  useBuyerProductRecommendations: () => ({
    data: { co_order: [], co_buyer: [], same_category: [] },
    isLoading: false,
  }),
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: () => ({
    addItem: addItemMock,
    updateQty: updateQtyMock,
    items: [],
    campaignId: null,
  }),
}));

vi.mock('@/contexts/StorefrontLoginContext', () => ({
  useStorefrontLogin: () => ({ openLogin: openLoginMock }),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: () => ({
    data: {
      mode: 'buyer',
      stock_visibility: { enabled: true },
      guest_pricing_mode: null,
    },
  }),
}));

vi.mock('@/lib/analytics-identity', () => ({
  useBuyerAnalyticsIds: () => ({ tenant_id: 'tenant-1', buyer_id: 'buyer-1' }),
}));

import { BuyerProductFamilyDetailClient } from '@/components/buyer/catalog/BuyerProductFamilyDetailClient';

const familyDetail = {
  family: {
    id: 'family-1',
    item_type: 'family',
    tenant_product_id: 'sku-1',
    product_family_id: 'family-1',
    child_sku_count: 2,
    campaign_id: null,
    campaign_name: null,
    campaign_valid_until: null,
    internal_sku: 'WM-REP',
    display_name: 'Weld Mesh',
    brand_id: null,
    brand_name: 'VBS Steel',
    category_id: 'cat-1',
    category_name: 'Steel',
    mrp: 0,
    price: 1200,
    price_summary: { min_price: 1200, max_price: 1400, display: 'from' },
    catalog_pricing_mode: 'base_selling_rate',
    collect_target_unit_price_range: false,
    resolved_price: 1200,
    gst_rate: 18,
    default_uom: 'roll',
    pack_size: 1,
    image_urls: [],
    image_url_large: null,
    stock_status: 'available',
    on_hand: 20,
  },
  variant_axes: [
    { key: 'Height', label: 'Height', values: ['3ft', '4ft'] },
    { key: 'Length', label: 'Length', values: ['10m', '30m'] },
  ],
  skus: [
    {
      tenant_product_id: 'sku-3x10',
      internal_sku: 'WM-3FT-10M',
      display_name: 'Weld Mesh 3ft 10m',
      attributes: { Height: '3ft', Length: '10m' },
      price: 1200,
      resolved_price: 1200,
      has_campaign_price: false,
      gst_rate: 18,
      default_uom: 'roll',
      pack_size: 1,
      stock_status: 'available',
      on_hand: 10,
    },
    {
      tenant_product_id: 'sku-4x30',
      internal_sku: 'WM-4FT-30M',
      display_name: 'Weld Mesh 4ft 30m',
      attributes: { Height: '4ft', Length: '30m' },
      price: 1400,
      resolved_price: 1400,
      has_campaign_price: false,
      gst_rate: 18,
      default_uom: 'roll',
      pack_size: 1,
      stock_status: 'available',
      on_hand: 8,
    },
  ],
};

describe('BuyerProductFamilyDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBuyerProductFamilyDetailMock.mockReturnValue({
      detail: familyDetail,
      family: familyDetail.family,
      isLoading: false,
      isError: false,
    });
  });

  it('lets mobile buyers resolve a family to a SKU before adding', async () => {
    render(<BuyerProductFamilyDetailClient productFamilyId="family-1" />);

    expect(screen.getByText('Choose variant')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '4ft' }));
    fireEvent.click(screen.getByRole('button', { name: '30m' }));

    await waitFor(() => {
      expect(screen.getAllByText('WM-4FT-30M').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Add 1' }).at(-1)!);

    expect(addItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_product_id: 'sku-4x30',
        internal_sku: 'WM-4FT-30M',
        quantity: 1,
      }),
      null,
      expect.objectContaining({ source_surface: 'product_family_detail' }),
    );
  });

  it('keeps the newly tapped option selected when clearing incompatible choices', async () => {
    render(<BuyerProductFamilyDetailClient productFamilyId="family-1" />);

    fireEvent.click(screen.getByRole('button', { name: '3ft' }));
    fireEvent.click(screen.getByRole('button', { name: '10m' }));
    await waitFor(() => {
      expect(screen.getAllByText('WM-3FT-10M').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '4ft' }));

    expect(screen.getByRole('button', { name: '4ft' }).className).toContain('border-[var(--teal-500)]');
    expect(screen.getByRole('button', { name: '10m' }).className).not.toContain('border-[var(--teal-500)]');
    expect(screen.getByText(/Choose Length/)).toBeInTheDocument();
  });
});
