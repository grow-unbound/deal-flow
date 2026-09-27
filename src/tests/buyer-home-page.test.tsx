import React, { type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const setRefreshFnMock = vi.fn();
const useCartMock = vi.fn();
const useBuyerMeMock = vi.fn();

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/buy/home',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/usePointerPrefetch', () => ({
  usePointerPrefetch: () => () => undefined,
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
  supabaseAdmin: null,
}));

vi.mock('@/lib/server/buyer-server-claims', () => ({
  getBuyerServerClaims: vi.fn(async () => ({
    tenant_id: 'tenant-1',
    buyer_id: 'buyer-1',
    role: 'buyer_admin',
  })),
}));

vi.mock('@/contexts/BuyerRealtimeContext', () => ({
  useBuyerRealtimeContext: () => ({
    unreadCount: 0,
    updatedEntityIds: new Map(),
    markSeen: vi.fn(),
    setRefreshFn: setRefreshFnMock,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    currentTenantId: 'tenant-1',
    currentBuyerId: null,
    tenantProfile: null,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/buyer/layout/BuyerNotificationDrawer', () => ({
  BuyerNotificationDrawer: () => null,
}));

vi.mock('@/components/buyer/layout/BuyerSelectionGate', () => ({
  BuyerSelectionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: (...args: unknown[]) => useCartMock(...args),
}));

vi.mock('@/hooks/useInfiniteScroll', () => ({
  getSentinelInsertIndex: () => -1,
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: (...args: unknown[]) => useBuyerMeMock(...args),
}));

import HomePage from '../../app/(buyer)/buy/home/page';
import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';

function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => data,
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('buyer home page', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    apiFetchMock.mockReset();
    setRefreshFnMock.mockReset();
    useBuyerMeMock.mockReset();
    useBuyerMeMock.mockReturnValue({
      data: {
        mode: 'buyer',
        greeting_name: 'Rajan',
        contact_name: 'Rajan',
        tenant: { id: 'tenant-1', name: 'Yukti', logo_url: null },
        order_features: { enquiries: true, sales_orders: true, invoices: true },
      },
    });
    useCartMock.mockReset();
    useCartMock.mockReturnValue({
      items: [],
      addItem: vi.fn(),
      updateQty: vi.fn(),
    });
    (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver = class IntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof IntersectionObserver;
  });

  it('renders the catalog landing and independent section fetches', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/home/promotions') {
        return jsonResponse({
          latest_promotions_preview: [
            { id: 'promo-1', name: 'Monsoon Promo', product_count: 12, valid_until: null, share_token: 'tok', hero_image_url: null },
          ],
        });
      }
      if (url === '/api/buyer/home/reco') {
        return jsonResponse({
          order_again_preview: [
            { tenant_product_id: 'tp-1', display_name: 'Cabernet Sauvignon', image_urls: [], price: 900 },
          ],
          bestsellers: [],
        });
      }
      if (url === '/api/buyer/brands') {
        return jsonResponse({ brands: [] });
      }
      if (url === '/api/buyer/categories') {
        return jsonResponse({ categories: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithQueryClient(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(await screen.findByText('Monsoon Promo')).toBeInTheDocument();
    expect(screen.getByText('Order Again')).toBeInTheDocument();
    expect(screen.getByText('Cabernet Sauvignon')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/home/promotions');
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/home/reco');
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/brands', undefined);
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/categories', undefined);
    });
  });

  it('shows guest public-catalog price visibility on home bestsellers', async () => {
    useBuyerMeMock.mockReturnValue({
      data: {
        mode: 'guest',
        guest_pricing_mode: 'hidden_until_login',
        tenant: { id: 'tenant-1', name: 'Yukti', logo_url: null },
        order_features: { enquiries: true, sales_orders: true, invoices: true },
      },
    });
    apiFetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/buyer/catalog?')) {
        return jsonResponse({ items: [], total: 0, has_more: false });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithQueryClient(
      <CatalogDiscoveryLanding
        initialReco={{
          order_again_preview: [],
          bestsellers: [
            {
              id: 'tp-best-1',
              tenant_product_id: 'tp-best-1',
              campaign_id: null,
              campaign_name: null,
              campaign_valid_until: null,
              internal_sku: 'BEST-001',
              display_name: 'Public Bestseller Camera',
              brand_id: null,
              brand_name: 'CP Plus',
              category_id: null,
              category_name: null,
              mrp: 10000,
              price: null,
              resolved_price: null,
              has_campaign_price: false,
              default_uom: 'box',
              pack_size: null,
              image_urls: [],
              stock_status: 'available',
              on_hand: 0,
            },
          ],
        }}
        initialBrands={[]}
        initialCategories={[]}
      />,
    );

    expect(await screen.findByText('Bestsellers')).toBeInTheDocument();
    expect(screen.getByText('Public Bestseller Camera')).toBeInTheDocument();
    expect(screen.getByText('Login for Price')).toBeInTheDocument();
    expect(screen.queryByLabelText('Price hidden')).not.toBeInTheDocument();
  });
});
