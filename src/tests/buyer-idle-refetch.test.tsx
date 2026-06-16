import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSearchParamsMock = vi.fn();
const apiFetchMock = vi.fn();
const posthogCaptureMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/buy/catalog',
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: (...args: unknown[]) => posthogCaptureMock(...args),
  },
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import CatalogPage from '../../app/(buyer)/buy/catalog/page';
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

  it('fetches catalog data once on idle mount and not again on rerender', async () => {
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
              catalog_id: 'catalog-1',
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

    const { rerender } = render(<CatalogPage />);

    await screen.findByText('Bullet Camera');
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));

    rerender(<CatalogPage />);
    await flushEffects();

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches orders once on idle mount and not again on rerender', async () => {
    apiFetchMock.mockResolvedValue(
      await jsonResponse({
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
      }),
    );

    const { rerender } = render(<OrdersPage />);

    await screen.findByText('SO-001');
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    rerender(<OrdersPage />);
    await flushEffects();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
