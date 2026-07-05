'use client';

import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { BuyerActivityFeedResponse } from '@/lib/buyer-home-types';
import { PAGE_SIZE } from '@/lib/pagination';

const BUYER_QUERY_STALE_TIME = 30_000;
const BUYER_QUERY_GC_TIME = 2 * 60_000;

export function useBuyerActivityInfinite() {
  return useInfiniteQuery({
    queryKey: ['buyer-activity-infinite'],
    queryFn: async ({ pageParam }): Promise<BuyerActivityFeedResponse> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE.BUYER) });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await apiFetch(`/api/buyer/activity?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<BuyerActivityFeedResponse>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: BUYER_QUERY_STALE_TIME,
    gcTime: BUYER_QUERY_GC_TIME,
  });
}
