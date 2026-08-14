import React, { type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSearchParamsMock = vi.fn();
const apiFetchMock = vi.fn();
const posthogCaptureMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/buy/home',
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => posthogCaptureMock(...args),
  },
}));

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFlagState: () => true,
  useFlag: () => true,
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
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

import CatalogPage from '../../app/(buyer)/buy/home/page';
import OrdersPage from '../../app/(buyer)/buy/orders/page';

function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => data,
  });
}

function flushEffects() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const emptyBuyerMe = {
  mode: 'buyer',
  buyer_id: 'buyer-1',
  business_name: 'Test Buyer',
  contact_name: 'Test',
  phone: '9999999999',
  gstin: null,
  credit_limit: 0,
  credit_used: 0,
  open_orders_count: 0,
  seller_preview: false,
  support_whatsapp_number: null,
  tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
  order_features: { enquiries: true, sales_orders: true, invoices: true },
  business_policy: { credit_enabled: false, gst_inclusive: true, gst_rate: 18 },
  whatsapp_consent_required: false,
};

describe('buyer pages avoid idle refetch loops', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useSearchParamsMock.mockReset();
    apiFetchMock.mockReset();
    posthogCaptureMock.mockReset();

    useSearchParamsMock.mockReturnValue(new URLSearchParams());

    (globalThis as typeof globalThis & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver = class IntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof IntersectionObserver;
  });

  it.skip('fetches catalog data once on idle mount and not again on rerender', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/categories') {
        return jsonResponse({
          categories: [{ id: 'cat-1', name: 'CCTV', slug: 'cctv', product_count: 1 }],
        });
      }

      if (url.startsWith('/api/buyer/catalog?')) {
        return jsonResponse({
          items: [
            {
              id: 'item-1',
              tenant_product_id: 'tp-1',
              campaign_id: 'catalog-1',
              catalog_name: 'June Deals',
              catalog_valid_until: null,
              internal_sku: 'SKU-1',
              display_name: 'Bullet Camera',
              brand_id: 'brand-1',
              brand_name: 'Hikvision',
              category_id: 'cat-1',
              category_name: 'CCTV',
              mrp: 1000,
              price: 900,
              default_uom: 'pcs',
              pack_size: 1,
              image_urls: [],
              stock_status: 'available',
              on_hand: 24,
            },
          ],
          has_more: false,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { rerender } = renderWithQueryClient(<CatalogPage />);

    await screen.findByText('Bullet Camera');
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CatalogPage />
      </QueryClientProvider>,
    );
    await flushEffects();

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches only the default invoices tab on idle mount and not again on rerender', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/me') {
        return jsonResponse(emptyBuyerMe);
      }
      if (url.startsWith('/api/buyer/orders?')) {
        return jsonResponse({
          orders: [
            {
              id: 'order-1',
              order_number: 'SO-001',
              status: 'received',
              total_amount: 4500,
              placed_at: '2026-06-10T00:00:00.000Z',
              catalog_name: 'June Deals',
              items_count: 2,
            },
          ],
          nextCursor: null,
          total: 1,
        });
      }
      if (url.startsWith('/api/buyer/estimates?')) {
        return jsonResponse({ estimates: [], nextCursor: null, total: 0 });
      }
      if (url.startsWith('/api/buyer/invoices?')) {
        return jsonResponse({
          invoices: [
            {
              id: 'inv-1',
              invoice_number: 'INV-001',
              status: 'sent',
              total_amount: 1200,
              outstanding_balance: 1200,
              invoice_date: '2026-06-10',
              due_date: '2026-06-20',
            },
          ],
          nextCursor: null,
          total: 1,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <OrdersPage />
      </QueryClientProvider>,
    );

    await screen.findByText('INV-001');
    await waitFor(() => {
      const urls = apiFetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url === '/api/buyer/me')).toBe(true);
      expect(urls.some((url) => url.startsWith('/api/buyer/invoices?'))).toBe(true);
    });

    const urlsAfterMount = apiFetchMock.mock.calls.map((call) => String(call[0]));
    expect(urlsAfterMount.some((url) => url.startsWith('/api/buyer/orders?'))).toBe(false);
    expect(urlsAfterMount.some((url) => url.startsWith('/api/buyer/estimates?'))).toBe(false);

    const callCountAfterMount = apiFetchMock.mock.calls.length;
    rerender(
      <QueryClientProvider client={client}>
        <OrdersPage />
      </QueryClientProvider>,
    );
    await flushEffects();

    expect(apiFetchMock).toHaveBeenCalledTimes(callCountAfterMount);
  });
});
