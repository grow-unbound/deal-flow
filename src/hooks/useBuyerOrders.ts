'use client';

import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { PAGE_SIZE } from '@/lib/pagination';
import type { BuyerAppMode } from '@/types/buyer';

export interface BuyerOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  placed_at: string;
  catalog_name: string | null;
  items_count: number;
}

export interface BuyerOrdersPage {
  mode: BuyerAppMode;
  orders: BuyerOrder[];
  nextCursor: string | null;
  total: number | null;
  seller_preview?: boolean;
}

const BUYER_QUERY_STALE_TIME = 30_000;
const BUYER_QUERY_GC_TIME = 2 * 60_000;

export function useBuyerOrdersInfinite() {
  return useInfiniteQuery({
    queryKey: ['buyer-orders-infinite'],
    queryFn: async ({ pageParam }): Promise<BuyerOrdersPage> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE.BUYER) });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await apiFetch(`/api/buyer/orders?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<BuyerOrdersPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: BUYER_QUERY_STALE_TIME,
    gcTime: BUYER_QUERY_GC_TIME,
  });
}
