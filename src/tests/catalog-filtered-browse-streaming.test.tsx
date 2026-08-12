import React, { type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const setRefreshFnMock = vi.fn();
const setCampaignIdMock = vi.fn();

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/buy/catalog/category/cat-1',
  useSearchParams: () => new URLSearchParams(),
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

vi.mock('@/contexts/BuyerCartContext', () => ({
  useCart: () => ({
    setCampaignId: setCampaignIdMock,
    items: [],
  }),
}));

vi.mock('@/hooks/useInfiniteScroll', () => ({
  getSentinelInsertIndex: () => -1,
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('next/image', () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ''} />,
}));

import { CatalogFilteredBrowse } from '@/components/buyer/catalog/CatalogFilteredBrowse';

function jsonResponse(data: unknown, delayMs = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: true,
        json: async () => data,
      });
    }, delayMs);
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

const product = {
  id: 'item-1',
  tenant_product_id: 'tp-1',
  campaign_id: null,
  catalog_name: null,
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
};

describe('CatalogFilteredBrowse independent section streaming', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    setRefreshFnMock.mockReset();
    setCampaignIdMock.mockReset();
  });

  it('streams reco before product list settles and keeps labeled sections', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/categories') {
        return jsonResponse({
          categories: [{ id: 'cat-1', name: 'CCTV', slug: 'cctv', product_count: 3, image_url: null }],
        }, 20);
      }
      if (url === '/api/buyer/brands') {
        return jsonResponse({ brands: [] }, 20);
      }
      if (url === '/api/buyer/reco/category/cat-1') {
        return jsonResponse([{ ...product, id: 'reco-1', display_name: 'Trending Cam' }], 15);
      }
      if (typeof url === 'string' && url.startsWith('/api/buyer/catalog?')) {
        return jsonResponse({ items: [product], has_more: false }, 100);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithQueryClient(<CatalogFilteredBrowse mode="category" id="cat-1" />);

    expect(screen.getByText('Trending in this category')).toBeInTheDocument();
    expect(screen.getByText('All Products')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading desktop filters')).toBeInTheDocument();

    await screen.findByText('Trending Cam');

    await waitFor(() => {
      expect(screen.getByText('Bullet Camera')).toBeInTheDocument();
      expect(screen.getAllByText('CCTV').length).toBeGreaterThanOrEqual(2);
    });

    expect(screen.queryByLabelText('Loading desktop filters')).not.toBeInTheDocument();
    expect(apiFetchMock.mock.calls.some((c) => c[0] === '/api/buyer/reco/category/cat-1')).toBe(true);
    expect(apiFetchMock.mock.calls.some((c) => typeof c[0] === 'string' && c[0].startsWith('/api/buyer/catalog?'))).toBe(true);
  });
});
