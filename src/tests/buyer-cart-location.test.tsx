import React, { type ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useRouterMock = vi.fn();
const useCartMock = vi.fn();
const useCartBundlesMock = vi.fn();
const useBuyerDeliveryOptionalMock = vi.fn();
const useBuyerMeMock = vi.fn();
const apiFetchMock = vi.fn();
const useBuyerResolvedProductsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: (...args: unknown[]) => useCartMock(...args),
}));

vi.mock('@/hooks/useCartBundles', () => ({
  useCartBundles: (...args: unknown[]) => useCartBundlesMock(...args),
}));

vi.mock('@/contexts/BuyerDeliveryContext', () => ({
  useBuyerDeliveryOptional: (...args: unknown[]) => useBuyerDeliveryOptionalMock(...args),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: (...args: unknown[]) => useBuyerMeMock(...args),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/hooks/useBuyerProducts', () => ({
  useBuyerResolvedProducts: (...args: unknown[]) => useBuyerResolvedProductsMock(...args),
}));

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('buyer cart location details', () => {
  beforeEach(() => {
    useRouterMock.mockReset();
    useCartMock.mockReset();
    useCartBundlesMock.mockReset();
    useBuyerDeliveryOptionalMock.mockReset();
    useBuyerMeMock.mockReset();
    apiFetchMock.mockReset();
    useBuyerResolvedProductsMock.mockReset();
  });

  it('reuses the compact selected location label in cart details', async () => {
    useRouterMock.mockReturnValue({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() });
    useCartMock.mockReturnValue({
      items: [
        {
          tenant_product_id: 'tp-1',
          name: 'Camera',
          quantity: 1,
          line_total: 5000,
          unit_price: 5000,
        },
      ],
      itemCount: 1,
      subtotal: 5000,
      removeItem: vi.fn(),
      updateQty: vi.fn(),
      clearCart: vi.fn(),
      replaceItems: vi.fn(),
    });
    useCartBundlesMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    });
    useBuyerDeliveryOptionalMock.mockReturnValue({
      hydrated: true,
      selected: {
        place_id: 'place-1',
        label: 'Andheri West',
        formatted_address: 'Andheri West, Mumbai, Maharashtra',
        city: 'Mumbai',
        pincode: '400058',
        lat: 19.12,
        lng: 72.84,
        selection_source: 'maps',
        place_of_supply: 'Andheri West',
        nearest_warehouse_id: 'wh-1',
        routed_location_id: 'loc-1',
        routed_location_name: 'Sainikpuri',
        nearest_warehouse_name: 'Mumbai Warehouse',
        nearest_warehouse_distance_km: 4,
        nearest_warehouse_fallback: false,
      },
    });
    useBuyerMeMock.mockReturnValue({
      data: {
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant', outlets: [] },
        business_policy: { gst_inclusive: false, gst_rate: 18 },
        order_features: { create_sales_orders: true, create_enquiries: true },
      },
    });
    useBuyerResolvedProductsMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    apiFetchMock.mockResolvedValue({ json: async () => ({ success: true }) });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    expect(screen.getByText('Sainikpuri')).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/buyer/nearest-location'));
  });

  it('includes out-of-stock lines in totals and ordering when stock visibility is off', async () => {
    useRouterMock.mockReturnValue({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() });
    useCartMock.mockReturnValue({
      items: [
        {
          tenant_product_id: 'tp-1',
          name: 'Available Camera',
          quantity: 1,
          line_total: 5000,
          unit_price: 5000,
          stock_status: 'available',
        },
        {
          tenant_product_id: 'tp-2',
          name: 'Unavailable Camera',
          quantity: 1,
          line_total: 7000,
          unit_price: 7000,
          stock_status: 'out_of_stock',
        },
      ],
      itemCount: 2,
      subtotal: 12000,
      removeItem: vi.fn(),
      updateQty: vi.fn(),
      clearCart: vi.fn(),
      replaceItems: vi.fn(),
    });
    useCartBundlesMock.mockReturnValue({ data: null, isLoading: false, isError: false, error: null });
    useBuyerDeliveryOptionalMock.mockReturnValue({
      hydrated: true,
      selected: {
        place_id: 'place-1',
        label: 'Andheri West',
        formatted_address: 'Andheri West, Mumbai, Maharashtra',
        city: 'Mumbai',
        pincode: '400058',
        lat: 19.12,
        lng: 72.84,
        place_of_supply: 'Andheri West',
        nearest_warehouse_id: 'wh-1',
        routed_location_id: 'loc-1',
        nearest_warehouse_name: 'Mumbai Warehouse',
        nearest_warehouse_distance_km: 4,
        nearest_warehouse_fallback: false,
      },
    });
    useBuyerMeMock.mockReturnValue({
      data: {
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant', outlets: [] },
        business_policy: { gst_inclusive: true, gst_rate: 18 },
        order_features: { create_sales_orders: true, create_enquiries: true },
        stock_visibility: { enabled: false, block_order_on_oos: false },
      },
    });
    useBuyerResolvedProductsMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    expect(screen.queryByText('Out of stock for selected location')).not.toBeInTheDocument();
    expect(screen.queryByText('Excluded')).not.toBeInTheDocument();
    expect(screen.getByText('Included in Prices')).toBeInTheDocument();
    expect(screen.getAllByText('₹12,000').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /place order/i })).not.toBeDisabled();
  });

  it('grays out out-of-stock lines and confirms the order/enquiry split when block_order_on_oos is on', async () => {
    useRouterMock.mockReturnValue({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() });
    useCartMock.mockReturnValue({
      items: [
        {
          tenant_product_id: 'tp-1',
          name: 'Available Camera',
          quantity: 1,
          line_total: 5000,
          unit_price: 5000,
          stock_status: 'available',
        },
        {
          tenant_product_id: 'tp-2',
          name: 'Unavailable Camera',
          quantity: 1,
          line_total: 7000,
          unit_price: 7000,
          stock_status: 'out_of_stock',
        },
      ],
      itemCount: 2,
      subtotal: 12000,
      removeItem: vi.fn(),
      removeItems: vi.fn(),
      updateQty: vi.fn(),
      clearCart: vi.fn(),
      replaceItems: vi.fn(),
    });
    useCartBundlesMock.mockReturnValue({ data: null, isLoading: false, isError: false, error: null });
    useBuyerDeliveryOptionalMock.mockReturnValue({
      hydrated: true,
      selected: {
        place_id: 'place-1',
        label: 'Andheri West',
        formatted_address: 'Andheri West, Mumbai, Maharashtra',
        city: 'Mumbai',
        pincode: '400058',
        lat: 19.12,
        lng: 72.84,
        place_of_supply: 'Andheri West',
        nearest_warehouse_id: 'wh-1',
        routed_location_id: 'loc-1',
        nearest_warehouse_name: 'Mumbai Warehouse',
        nearest_warehouse_distance_km: 4,
        nearest_warehouse_fallback: false,
      },
    });
    useBuyerMeMock.mockReturnValue({
      data: {
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant', outlets: [] },
        business_policy: { gst_inclusive: true, gst_rate: 18 },
        order_features: { create_sales_orders: true, create_enquiries: true },
        stock_visibility: { enabled: true, block_order_on_oos: true },
      },
    });
    useBuyerResolvedProductsMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place order/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /get whatsapp quote/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    expect(await screen.findByText('Some items are out of stock')).toBeInTheDocument();
    expect(screen.getByText(/will be submitted as an Enquiry/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit order & enquiry/i })).toBeInTheDocument();
  });

  it('redirects first-time cart visits to outlet selection when nothing is selected', async () => {
    const replaceMock = vi.fn();
    useRouterMock.mockReturnValue({ back: vi.fn(), push: vi.fn(), replace: replaceMock, prefetch: vi.fn() });
    useCartMock.mockReturnValue({
      items: [
        {
          tenant_product_id: 'tp-1',
          name: 'Camera',
          quantity: 1,
          line_total: 5000,
          unit_price: 5000,
          stock_status: 'available',
        },
      ],
      itemCount: 1,
      subtotal: 5000,
      removeItem: vi.fn(),
      updateQty: vi.fn(),
      clearCart: vi.fn(),
      replaceItems: vi.fn(),
    });
    useCartBundlesMock.mockReturnValue({ data: null, isLoading: false, isError: false, error: null });
    useBuyerDeliveryOptionalMock.mockReturnValue({ hydrated: true, selected: null });
    useBuyerMeMock.mockReturnValue({
      data: {
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant', outlets: [] },
        business_policy: { gst_inclusive: false, gst_rate: 18 },
        order_features: { create_sales_orders: true, create_enquiries: true },
      },
    });
    useBuyerResolvedProductsMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/buy/location?returnTo=%2Fbuy%2Fcart');
    });
  });

  it('shows campaign price in cart rows after product reconciliation', async () => {
    const replaceItemsMock = vi.fn();
    useRouterMock.mockReturnValue({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() });
    useCartMock.mockReturnValue({
      items: [
        {
          tenant_product_id: 'tp-1',
          name: 'Camera',
          quantity: 1,
          line_total: 5000,
          unit_price: 5000,
          stock_status: 'available',
        },
      ],
      itemCount: 1,
      subtotal: 5000,
      removeItem: vi.fn(),
      updateQty: vi.fn(),
      clearCart: vi.fn(),
      replaceItems: replaceItemsMock,
      resolvedCampaignId: null,
      addItem: vi.fn(),
    });
    useCartBundlesMock.mockReturnValue({ data: null, isLoading: false, isError: false, error: null });
    useBuyerDeliveryOptionalMock.mockReturnValue({
      hydrated: true,
      selected: {
        place_id: 'place-1',
        label: 'Andheri West',
        formatted_address: 'Andheri West, Mumbai, Maharashtra',
        city: 'Mumbai',
        pincode: '400058',
        lat: 19.12,
        lng: 72.84,
        place_of_supply: 'Andheri West',
        nearest_warehouse_id: 'wh-1',
        routed_location_id: 'loc-1',
        nearest_warehouse_name: 'Mumbai Warehouse',
        nearest_warehouse_distance_km: 4,
        nearest_warehouse_fallback: false,
      },
    });
    useBuyerMeMock.mockReturnValue({
      data: {
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant', outlets: [] },
        business_policy: { gst_inclusive: false, gst_rate: 18 },
        order_features: { create_sales_orders: true, create_enquiries: true },
      },
    });
    useBuyerResolvedProductsMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'tp-1',
            tenant_product_id: 'tp-1',
            campaign_id: 'camp-1',
            campaign_name: 'Monsoon Promo',
            campaign_valid_until: '2026-07-31T00:00:00.000Z',
            internal_sku: 'SKU-1',
            display_name: 'Camera',
            brand_id: null,
            brand_name: null,
            category_id: null,
            category_name: null,
            mrp: 6200,
            price: 5000,
            resolved_price: 6200,
            campaign_price: 5000,
            has_campaign_price: true,
            gst_rate: 18,
            default_uom: 'pc',
            pack_size: null,
            image_urls: [],
            stock_status: 'available',
            on_hand: 5,
          },
        ],
        missing_ids: [],
      },
      isLoading: false,
      isError: false,
    });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    expect(replaceItemsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenant_product_id: 'tp-1',
          unit_price: 5000,
          resolved_price: 6200,
          has_campaign_price: true,
          unit: 'pc',
        }),
      ]),
    );
  });
});
