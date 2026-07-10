import React, { type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const setRefreshFnMock = vi.fn();
const useCartMock = vi.fn();

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

  it('renders the new hierarchy and links', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/home') {
        return jsonResponse({
          greeting_name: 'Rajan',
          summary_card: { gmv_mtd: 1854000, gmv_ytd: 3250000, invoice_count_ytd: 47, trend_vs_last_month_pct: 12 },
          dues_card: { outstanding_dues: 240000, open_invoice_count: 4, earliest_due_date: '2026-06-22', days_until_earliest_due: 2 },
          credit_card: { credit_limit: 250000, available_credit: 10000, credit_used: 240000 },
          order_again_preview: [
            { tenant_product_id: 'tp-1', display_name: 'Cabernet Sauvignon', image_urls: [], price: 900 },
          ],
          latest_promotions_preview: [
            { id: 'promo-1', name: 'Monsoon Promo', product_count: 12, valid_until: null, share_token: 'tok', hero_image_url: null },
          ],
          recent_activity: { items: [], next_cursor: null },
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

    expect(await screen.findByRole('heading', { name: 'Your shelf, this month.' })).toHaveStyle({ fontSize: 'var(--b-text-page-sm)' });
    expect(await screen.findByText(/Good (morning|afternoon|evening), Rajan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toHaveClass('h-12', 'w-12');
    expect(screen.getByText('Latest promotions')).toBeInTheDocument();
    expect(screen.getByText('₹32,50,000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse all/i })).toHaveAttribute('href', '/buy/buy-again');
    const seeAllLinks = screen.getAllByRole('link', { name: /see all/i });
    expect(seeAllLinks.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/buy/promotions', '/buy/orders']),
    );
    expect(screen.queryByText('Your distributor')).not.toBeInTheDocument();
    expect(await screen.findByText('SO-001')).toBeInTheDocument();
    expect(screen.getByText('Sales order')).toBeInTheDocument();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
  });
});
