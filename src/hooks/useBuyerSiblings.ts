'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import {
  BUYER_REFERENCE_QUERY_GC_TIME,
  BUYER_REFERENCE_QUERY_STALE_TIME,
} from '@/lib/query-navigation';
import type { BuyerSiblingRow } from '@/types/buyer';

export const BUYER_SIBLINGS_QUERY_KEY = ['buyer-siblings'] as const;

interface BuyerSiblingsResponse {
  siblings: BuyerSiblingRow[];
}

export function useBuyerSiblings(enabled = true) {
  return useQuery({
    queryKey: BUYER_SIBLINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/buyer/siblings');
      if (!res.ok) {
        throw new Error('Failed to load buyer accounts');
      }
      const data = (await res.json()) as BuyerSiblingsResponse;
      return data.siblings;
    },
    enabled,
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  });
}

export function prefetchBuyerSiblings(queryClient: import('@tanstack/react-query').QueryClient): void {
  void queryClient.prefetchQuery({
    queryKey: BUYER_SIBLINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/buyer/siblings');
      if (!res.ok) {
        throw new Error('Failed to load buyer accounts');
      }
      const data = (await res.json()) as BuyerSiblingsResponse;
      return data.siblings;
    },
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
}
