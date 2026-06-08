'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useDebounce } from '@/hooks/useDebounce';
import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type {
  SalesOrderComposerDocument,
  SalesOrderComposerProductSearchRow,
  SalesOrderComposerSavePayload,
  SalesOrderComposerBuyerContext,
  SalesOrderStockCheckRow,
} from '@/types/sales-order-composer';

async function fetchTenantSalesOrderComposer(orderId: string): Promise<SalesOrderComposerDocument> {
  const res = await apiFetch(`/api/tenant/orders/${orderId}?view=composer`);
  if (res.status === 404) throw new Error('not_found');
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error('Failed to fetch sales order');
  return (await res.json()) as SalesOrderComposerDocument;
}

export function tenantSalesOrderComposerQueryOptions(orderId: string) {
  return {
    queryKey: ['tenant-sales-order-composer', orderId] as const,
    queryFn: () => fetchTenantSalesOrderComposer(orderId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  };
}

export async function prefetchSalesOrderComposer(qc: QueryClient, orderId: string): Promise<void> {
  await qc.prefetchQuery(tenantSalesOrderComposerQueryOptions(orderId));
}

export function useSalesOrderComposer(orderId: string | null) {
  return useQuery({
    queryKey: ['tenant-sales-order-composer', orderId],
    queryFn: () => fetchTenantSalesOrderComposer(orderId!),
    enabled: Boolean(orderId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useNextSalesOrderNumber(enabled: boolean) {
  return useQuery({
    queryKey: ['next-sales-order-number'],
    queryFn: async (): Promise<string> => {
      const res = await apiFetch('/api/tenant/orders/next-number');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch next order number');
      }
      const json = (await res.json()) as { order_number: string };
      return json.order_number;
    },
    enabled,
    staleTime: 30_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSaveSalesOrderComposer(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SalesOrderComposerSavePayload) => {
      if (!orderId) throw new Error('Missing sales order id');
      const res = await apiPatch(`/api/tenant/orders/${orderId}`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to save sales order');
      }
      return (await res.json()) as { data: SalesOrderComposerDocument };
    },
    onSuccess: (payload) => {
      if (!orderId) return;
      qc.setQueryData(['tenant-sales-order-composer', orderId], payload.data);
      void qc.invalidateQueries({ queryKey: ['tenant-sales-order', orderId] });
      void qc.invalidateQueries({ queryKey: ['tenant-orders'] });
    },
  });
}

export function useSalesOrderStockCheck(orderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['tenant-sales-order-stock-check', orderId],
    queryFn: async (): Promise<SalesOrderStockCheckRow[]> => {
      if (!orderId) return [];
      const res = await apiFetch(`/api/tenant/orders/${orderId}/stock-check`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to check stock');
      }
      const json = (await res.json()) as { data: SalesOrderStockCheckRow[] };
      return json.data;
    },
    enabled: Boolean(orderId) && enabled,
    staleTime: 0,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useDebouncedSalesOrderStockCheck(orderId: string | null, enabled: boolean, waitMs = 500) {
  const debounced = useDebounce(`${orderId ?? ''}:${enabled ? '1' : '0'}`, waitMs);
  return useSalesOrderStockCheck(orderId, Boolean(orderId) && enabled && Boolean(debounced));
}

export function useBuyerSalesOrderContext(buyerId: string | null) {
  return useQuery({
    queryKey: ['sales-order-buyer-context', buyerId],
    queryFn: async (): Promise<SalesOrderComposerBuyerContext> => {
      const res = await apiFetch(`/api/tenant/buyers/${buyerId}/context`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch buyer context');
      }
      const json = (await res.json()) as { data: SalesOrderComposerBuyerContext };
      return json.data;
    },
    enabled: Boolean(buyerId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSalesOrderProductSearch(query: string, buyerId: string | null) {
  const debounced = useDebounce(query, 200);

  return useQuery({
    queryKey: ['sales-order-product-search', debounced, buyerId],
    queryFn: async (): Promise<SalesOrderComposerProductSearchRow[]> => {
      const params = new URLSearchParams({ q: debounced });
      if (buyerId) params.set('buyerId', buyerId);
      const res = await apiFetch(`/api/tenant/products/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to search products');
      }
      const json = (await res.json()) as { products: SalesOrderComposerProductSearchRow[] };
      return json.products;
    },
    enabled: debounced.trim().length >= 1 && Boolean(buyerId),
    staleTime: 30_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}
