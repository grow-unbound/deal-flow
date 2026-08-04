import React, { type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const setRefreshFnMock = vi.fn();
const useCartMock = vi.fn();

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

vi.mock('@/contexts/BuyerRealtimeContext', () => ({
  useBuyerRealtimeContext: () => ({
    unreadCount: 0,
    updatedEntityIds: new Map(),
    markSeen: vi.fn(),
    setRefreshFn: setRefreshFnMock,
  }),
}));

vi.mock('@/components/buyer/layout/BuyerNotificationDrawer', () => ({
  BuyerNotificationDrawer: () => null,
}));

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: (...args: unknown[]) => useCartMock(...args),
}));

vi.mock('@/hooks/useInfiniteScroll', () => ({
  getSentinelInsertIndex: () => -1,
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('@/hooks/useBuyerMe', () => ({
  useBuyerMe: () => ({
    data: {
      greeting_name: 'Rajan',
      contact_name: 'Rajan',
      order_features: { enquiries: true, sales_orders: true, invoices: true },
    },
  }),
}));

import HomePage from '../../app/(buyer)/buy/home/page';

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

  it('renders the V4 KPI hierarchy and independent section fetches', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/home/metrics') {
        return jsonResponse({
          period: {
            period_key: 'this_quarter',
            grain: 'quarter',
            period_start: '2026-07-01',
            period_end_exclusive: '2026-10-01',
          },
          spend_qtd: 3250000,
          invoice_count_qtd: 47,
          demand_qtd: 1854000,
          demand_document_count_qtd: 12,
          demand_kind: 'orders',
          credit_limit: 250000,
          outstanding: 240000,
          overdue: 50000,
          available_credit: 10000,
          computed_at: '2026-08-04T06:30:00.000Z',
        });
      }
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
      if (url.startsWith('/api/buyer/activity?')) {
        return jsonResponse({
          items: [
            {
              id: 'order:1',
              type: 'order',
              entity_id: 'ord-1',
              title: 'SO-001',
              status: 'received',
              amount: 4500,
              timestamp: '2026-06-10T00:00:00.000Z',
              href: '/buy/orders/ord-1',
              meta: 'Sales order',
            },
          ],
          next_cursor: null,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithQueryClient(<HomePage />);

    expect(await screen.findByRole('heading', { name: 'Your shelf, this quarter.' })).toBeInTheDocument();
    expect(await screen.findByText(/Good (morning|afternoon|evening), Rajan/)).toBeInTheDocument();
    expect(screen.getByText('Spend this quarter')).toBeInTheDocument();
    expect(screen.getByText('Orders this quarter')).toBeInTheDocument();
    expect(screen.getByText('₹32,50,000')).toBeInTheDocument();
    expect(screen.getByText('47 invoices')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Available credit')).toBeInTheDocument();
    expect(screen.getByText(/as of /)).toBeInTheDocument();
    expect(screen.getByText('Promotions')).toBeInTheDocument();
    const seeAllLinks = screen.getAllByRole('link', { name: /see all/i });
    expect(seeAllLinks.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/buy/promotions', '/buy/orders']),
    );
    expect(screen.getByRole('link', { name: /spend this quarter/i })).toHaveAttribute('href', '/buy/orders?tab=invoices');
    expect(screen.getByRole('link', { name: /orders this quarter/i })).toHaveAttribute('href', '/buy/orders?tab=orders');
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/home/metrics');
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/home/promotions');
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buyer/home/reco');
    });
  });
});
