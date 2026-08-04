'use client';

import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { PAGE_SIZE } from '@/lib/pagination';
import { BUYER_QUERY_STALE_TIME, BUYER_QUERY_GC_TIME } from '@/lib/query-navigation';

export interface BuyerInvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
}

export interface BuyerInvoicesPage {
  invoices: BuyerInvoiceRow[];
  nextCursor: string | null;
  total: number | null;
}

export function useBuyerInvoicesInfinite(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ['buyer-invoices-infinite'],
    queryFn: async ({ pageParam }): Promise<BuyerInvoicesPage> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE.BUYER) });
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await apiFetch(`/api/buyer/invoices?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<BuyerInvoicesPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: BUYER_QUERY_STALE_TIME,
    gcTime: BUYER_QUERY_GC_TIME,
    enabled: options?.enabled ?? true,
  });
}
