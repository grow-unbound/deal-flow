import React, { type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAccessList,
  useToggleBuyerAccess,
  type AccessPageResponse,
} from '@/hooks/useBuyerAppAccess';

const apiPatchMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
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
    apiFetchMock.mockReset();
  });

  it('optimistically updates visible rows without recomputing aggregate KPI totals from the page', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const initial: AccessPageResponse = {
      summary_authoritative: true,
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
          offline_spend_mtd: 5000,
          total_spend_mtd: 5000,
          app_gmv_mtd: 0,
          is_suggested: true,
          is_inactive: false,
        },
      ],
      filtered_count: 100,
      has_more: true,
      limit: 1,
      offset: 0,
    };
    const listKey = [
      'buyer-app-access',
      'list',
      { q: '', status: 'all', lastOrdered: 'all', sort: 'business_name', limit: 1 },
    ];
    queryClient.setQueryData(
      listKey,
      { pages: [initial], pageParams: [0] },
    );
    apiPatchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        updated_count: 1,
        whatsapp_sent_count: 0,
        whatsapp_eligible_count: 0,
      }),
    });

    const { result } = renderHook(() => useToggleBuyerAccess(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ buyer_ids: ['buyer-1'], enabled: true });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{
        pages: AccessPageResponse[];
        pageParams: number[];
      }>(listKey);
      expect(cached?.pages[0].buyers[0].buyer_app_enabled).toBe(true);
      expect(cached?.pages[0].buyers[0].is_suggested).toBe(false);
      expect(cached?.pages[0].kpis).toEqual(initial.kpis);
    });
  });

  it('retains authoritative SSR counts while filtered list requests opt out of summaries', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const authoritativeKpis = {
      enabled_count: 10,
      not_enabled_count: 90,
      suggested_count: 7,
      inactive_count: 3,
      total_count: 100,
    };
    const initial: AccessPageResponse = {
      summary_authoritative: true,
      kpis: authoritativeKpis,
      buyers: [],
      filtered_count: 100,
      has_more: true,
      limit: 25,
      offset: 0,
    };
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        summary_authoritative: false,
        kpis: null,
        buyers: [],
        filtered_count: 0,
        has_more: false,
        limit: 25,
        offset: 0,
      } satisfies AccessPageResponse),
    });

    const { result, rerender } = renderHook(
      ({ q }) => useAccessList({ q, limit: 25 }, initial),
      {
        initialProps: { q: '' },
        wrapper: createWrapper(queryClient),
      },
    );

    expect(result.current.authoritativeKpis).toEqual(authoritativeKpis);

    rerender({ q: 'alpha' });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('q=alpha'));
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('summary=false'));
      expect(result.current.authoritativeKpis).toEqual(authoritativeKpis);
    });
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('summary=true'));
  });
});
