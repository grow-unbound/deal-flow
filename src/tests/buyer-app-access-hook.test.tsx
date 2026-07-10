import React, { type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToggleBuyerAccess, type AccessPageResponse } from '@/hooks/useBuyerAppAccess';

const apiPatchMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactElement }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useToggleBuyerAccess', () => {
  beforeEach(() => {
    apiPatchMock.mockReset();
  });

  it('optimistically updates visible rows without recomputing aggregate KPI totals from the page', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const initial: AccessPageResponse = {
      kpis: {
        enabled_count: 10,
        not_enabled_count: 90,
        suggested_count: 7,
        inactive_count: 3,
        total_count: 100,
      },
      buyers: [
        {
          id: 'buyer-1',
          business_name: 'Alpha Retail',
          contact_name: 'Asha',
          phone: '9999999991',
          city: 'Hyderabad',
          state: 'Telangana',
          buyer_app_enabled: false,
          last_app_order_at: null,
          offline_spend_90d: 5000,
          total_spend_90d: 5000,
          app_gmv_90d: 0,
          is_suggested: true,
          is_inactive: false,
        },
      ],
      has_more: true,
      limit: 1,
    };
    queryClient.setQueryData(['buyer-app-access'], initial);
    apiPatchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const { result } = renderHook(() => useToggleBuyerAccess(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ buyer_ids: ['buyer-1'], enabled: true });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<AccessPageResponse>(['buyer-app-access']);
      expect(cached?.buyers[0].buyer_app_enabled).toBe(true);
      expect(cached?.buyers[0].is_suggested).toBe(false);
      expect(cached?.kpis).toEqual(initial.kpis);
    });
  });
});
