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
const useSearchParamsMock = vi.fn();
const markBuyerNavigationBackMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();
const prefetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
  usePathname: () => '/buy/orders',
}));

vi.mock('@/hooks/useBuyerNavigationDirection', () => ({
  markBuyerNavigationBack: (...args: unknown[]) => markBuyerNavigationBackMock(...args),
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

vi.mock('@/hooks/useInfiniteScroll', () => ({
  getSentinelInsertIndex: () => -1,
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('@/contexts/BuyerRealtimeContext', () => ({
  useBuyerRealtimeContext: () => ({
    unreadCount: 0,
    updatedEntityIds: new Map(),
    markSeen: vi.fn(),
    setRefreshFn: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase-browser', () => ({
  supabaseBrowser: {
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  },
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

const selectedDelivery = {
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
};

function setupCartMocks(orderFeatures = { create_sales_orders: true, create_enquiries: true }) {
  useRouterMock.mockReturnValue({
    back: vi.fn(),
    push: pushMock,
    replace: replaceMock,
    prefetch: prefetchMock,
  });
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
    removeItem: vi.fn(),
    updateQty: vi.fn(),
    clearCart: vi.fn(),
    replaceItems: vi.fn(),
    resolvedCampaignId: null,
  });
  useCartBundlesMock.mockReturnValue({ data: null, isLoading: false, isError: false, error: null });
  useBuyerDeliveryOptionalMock.mockReturnValue({ selected: selectedDelivery });
  useBuyerMeMock.mockReturnValue({
    data: {
      tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
      business_policy: { gst_inclusive: false, gst_rate: 18 },
      order_features: orderFeatures,
    },
  });
  useBuyerResolvedProductsMock.mockReturnValue({ data: null, isLoading: false, isError: false });
}

describe('buyer cart submission', () => {
  beforeEach(() => {
    useRouterMock.mockReset();
    useCartMock.mockReset();
    useCartBundlesMock.mockReset();
    useBuyerDeliveryOptionalMock.mockReset();
    useBuyerMeMock.mockReset();
    apiFetchMock.mockReset();
    useBuyerResolvedProductsMock.mockReset();
    useSearchParamsMock.mockReset();
    markBuyerNavigationBackMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    prefetchMock.mockReset();
    window.sessionStorage.clear();
  });

  it('keeps place-order CTA disabled after success until navigation', async () => {
    setupCartMocks();
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    apiFetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    const placeButton = screen.getByRole('button', { name: /place order/i });
    fireEvent.click(placeButton);

    await waitFor(() => {
      expect(screen.getByText('Placing your order…')).toBeInTheDocument();
    });
    expect(placeButton).toBeDisabled();

    resolveFetch({
      ok: true,
      json: async () => ({
        success: true,
        order_id: 'ord-1',
        order_number: 'DF-1',
      }),
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining('/buy/order-placed?'),
      );
    });
    expect(placeButton).toBeDisabled();
  });

  it('returns to idle and shows error when place-order fails', async () => {
    setupCartMocks();
    apiFetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Could not place order' }),
    });

    const { default: CartPage } = await import('../../app/(buyer)/buy/cart/page');
    renderWithQueryClient(<CartPage />);

    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    await waitFor(() => {
      expect(screen.getByText('Could not place order')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /place order/i })).not.toBeDisabled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('buyer transaction placed page CTAs', () => {
  beforeEach(() => {
    markBuyerNavigationBackMock.mockReset();
    pushMock.mockReset();
    useRouterMock.mockReturnValue({ push: pushMock, replace: vi.fn(), back: vi.fn() });
    useCartMock.mockReturnValue({ clearCart: vi.fn() });
    apiFetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
  });

  it('navigates to catalog and orders with tab + highlight for orders', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams({
        order_id: 'ord-99',
        order_number: 'DF-99',
        total: '5000',
      }),
    );

    const { BuyerTransactionPlacedPage } = await import(
      '@/components/buyer/transactions/BuyerTransactionPlacedPage'
    );
    renderWithQueryClient(
      <BuyerTransactionPlacedPage
        kind="order"
        title="Order created"
        detailEndpoint="/api/buyer/orders"
        successHeading="Order created successfully"
        successCopy="Done"
        documentLabel="Order"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /go to catalog/i }));
    expect(markBuyerNavigationBackMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/buy/catalog');

    fireEvent.click(screen.getByRole('button', { name: /go to orders/i }));
    expect(pushMock).toHaveBeenCalledWith('/buy/orders?tab=orders&highlight=ord-99');
  });

  it('navigates to enquiries tab for estimates', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams({
        estimate_id: 'est-42',
        estimate_number: 'ENQ-42',
        total: '3000',
      }),
    );

    const { BuyerTransactionPlacedPage } = await import(
      '@/components/buyer/transactions/BuyerTransactionPlacedPage'
    );
    renderWithQueryClient(
      <BuyerTransactionPlacedPage
        kind="estimate"
        title="Estimate created"
        detailEndpoint="/api/buyer/estimates"
        successHeading="Estimate created successfully"
        successCopy="Done"
        documentLabel="Estimate"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /go to orders/i }));
    expect(pushMock).toHaveBeenCalledWith('/buy/orders?tab=enquiries&highlight=est-42');
  });
});

describe('buyer orders page tab URL precedence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useSearchParamsMock.mockReset();
    apiFetchMock.mockReset();
    (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      class IntersectionObserver {
        observe() {}
        disconnect() {}
        unobserve() {}
      } as typeof IntersectionObserver;

    apiFetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/buyer/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            mode: 'buyer',
            seller_preview: false,
            order_features: { enquiries: true, sales_orders: true, invoices: true },
            tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
          }),
        });
      }
      if (url.startsWith('/api/buyer/orders')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ orders: [], nextCursor: null, total: 0 }),
        });
      }
      if (url.startsWith('/api/buyer/estimates')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ estimates: [], nextCursor: null, total: 0 }),
        });
      }
      if (url.startsWith('/api/buyer/invoices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ invoices: [], nextCursor: null, total: 0 }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('prefers tab query param over restored session snapshot', async () => {
    window.sessionStorage.setItem(
      'yukti_route_snapshot:buyer-orders-page-tab:/buy/orders',
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        pathname: '/buy/orders',
        payload: 'enquiries',
      }),
    );

    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=orders'));

    const { default: OrdersPage } = await import('../../app/(buyer)/buy/orders/page');
    renderWithQueryClient(<OrdersPage />);

    await waitFor(() => {
      const ordersTab = screen.getByRole('button', { name: /orders/i });
      expect(ordersTab).toHaveStyle({ background: '#fff' });
    });
  });
});
