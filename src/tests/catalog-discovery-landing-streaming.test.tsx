import React, { type ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const setRefreshFnMock = vi.fn();

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/buy/home',
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

vi.mock('@/hooks/useInfiniteScroll', () => ({
  getSentinelInsertIndex: () => -1,
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('@/components/buyer/layout/BuyerCatalogLocationLink', () => ({
  BuyerCatalogLocationLink: () => <span>Location</span>,
}));

vi.mock('next/image', () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ''} />,
}));

import { CatalogDiscoveryLanding } from '@/components/buyer/catalog/CatalogDiscoveryLanding';

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

describe('CatalogDiscoveryLanding independent section streaming', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    setRefreshFnMock.mockReset();
  });

  it('renders campaigns as soon as catalogs resolve without waiting for brands/categories', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/buyer/catalogs') {
        return jsonResponse({
          catalogs: [{
            id: 'camp-1',
            name: 'Monsoon Push',
            product_count: 12,
            share_token: 'tok',
            valid_until: null,
            hero_image_url: null,
          }],
        }, 10);
      }
      if (url === '/api/buyer/brands') {
        return jsonResponse({
          brands: [{ id: 'brand-1', name: 'Hikvision', product_count: 4, logo_url: null }],
        }, 80);
      }
      if (url === '/api/buyer/categories') {
        return jsonResponse({
          categories: [{ id: 'cat-1', name: 'CCTV', slug: 'cctv', product_count: 3, image_url: null }],
        }, 120);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithQueryClient(<CatalogDiscoveryLanding />);

    // Section titles paint immediately (home-style labeled skeleton).
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Brands')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
    await screen.findByText('Monsoon Push');

    await waitFor(() => {
      expect(screen.getByText('Hikvision')).toBeInTheDocument();
      expect(screen.getAllByText('CCTV').length).toBeGreaterThanOrEqual(1);
    });

    expect(apiFetchMock.mock.calls.some((call) => call[0] === '/api/buyer/catalogs')).toBe(true);
    expect(apiFetchMock.mock.calls.some((call) => call[0] === '/api/buyer/brands')).toBe(true);
    expect(apiFetchMock.mock.calls.some((call) => call[0] === '/api/buyer/categories')).toBe(true);
  });
});
