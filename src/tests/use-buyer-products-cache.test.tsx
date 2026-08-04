import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiPost: vi.fn(),
}));

vi.mock('@/contexts/BuyerDeliveryContext', () => ({
  useBuyerDeliveryOptional: () => ({
    selected: {
      nearest_warehouse_id: 'wh-1',
      routed_location_id: 'loc-1',
      place_id: 'place-1',
      lat: 17.4,
      lng: 78.5,
    },
  }),
}));

import { useBuyerCatalogList, useBuyerProductDetail } from '@/hooks/useBuyerProducts';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => data,
  });
}

describe('useBuyerProducts cache policy', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('bypasses browser cache for catalog list stock fetches', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({
        items: [],
        total: 0,
        has_more: false,
      }),
    );

    renderHook(() => useBuyerCatalogList('category', 'cat-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/buyer/catalog?'),
      expect.objectContaining({ fresh: true }),
    );
  });

  it('bypasses browser cache for product detail stock fetches', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({
        item: null,
      }),
    );

    renderHook(() => useBuyerProductDetail('tp-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.some(([url, init]) =>
          typeof url === 'string'
          && url.includes('/api/buyer/products/tp-1')
          && Boolean(init && typeof init === 'object' && 'fresh' in init && init.fresh === true),
        ),
      ).toBe(true),
    );
  });
});
