'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod } from '@/lib/seller-period';
import { useDebounce } from '@/hooks/useDebounce';
import type {
  EstimateComposerBuyerContext,
  EstimateComposerDocument,
  EstimateComposerPriceListOption,
  EstimateComposerProductSearchRow,
  EstimateComposerSavePayload,
  EstimateSendChannel,
} from '@/types/estimate-composer';
import type { TenantEstimateDetailResponse } from '@/types/tenant-estimate-detail';
import type { TenantEstimatesResponse } from '@/types/tenant-estimates';

export type {
  EstimateAvatarHue,
  EstimateCalloutRow,
  EstimateDbStatus,
  EstimateFilterChip,
  EstimateLandingRow,
  EstimateStatusTone,
  EstimatesKpis,
  EstimatesTodaysRead,
  TenantEstimatesResponse,
} from '@/types/tenant-estimates';

export function useTenantEstimates(period: SellerLandingPeriod = 'month', initialData?: TenantEstimatesResponse | null) {
  return useQuery({
    queryKey: ['tenant-estimates', period],
    queryFn: async (): Promise<TenantEstimatesResponse> => {
      const res = await apiFetch(`/api/tenant/estimates?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch estimates');
      return res.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

async function fetchTenantEstimateDetail(estimateId: string): Promise<TenantEstimateDetailResponse> {
  const res = await apiFetch(`/api/tenant/estimates/${estimateId}`);
  if (res.status === 404) throw new Error('not_found');
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error('Failed to fetch estimate');
  const json = (await res.json()) as { data: TenantEstimateDetailResponse };
  return json.data;
}

export function tenantEstimateComposerQueryOptions(estimateId: string) {
  return {
    queryKey: ['tenant-estimate-composer', estimateId] as const,
    queryFn: () => fetchTenantEstimateDetail(estimateId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  };
}

export async function prefetchEstimateComposer(qc: QueryClient, estimateId: string): Promise<void> {
  await qc.prefetchQuery(tenantEstimateComposerQueryOptions(estimateId));
}

export function seedEstimateComposerCache(qc: QueryClient, estimateId: string, data: TenantEstimateDetailResponse): void {
  qc.setQueryData(tenantEstimateComposerQueryOptions(estimateId).queryKey, data);
}

export function useEstimateDetail(estimateId: string) {
  return useQuery({
    queryKey: ['tenant-estimate-detail', estimateId],
    queryFn: () => fetchTenantEstimateDetail(estimateId),
    enabled: Boolean(estimateId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useEstimateAction(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { action: string; due_date?: string }) => {
      const res = await apiPost(`/api/tenant/estimates/${estimateId}/actions`, input);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Action failed');
      }
      const json = (await res.json()) as { data: Record<string, unknown> };
      return json.data;
    },
    onSuccess: () => {
      toast.success('Estimate updated');
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-composer', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimates'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    },
  });
}

export function useConvertEstimateToOrder(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { delivery_date: string; line_ids: string[]; order_number?: string }) => {
      const res = await apiPatch(`/api/tenant/estimates/${estimateId}/convert`, input);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Convert failed');
      }
      return (await res.json()) as { data: Record<string, unknown> };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-composer', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimates'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Convert failed');
    },
  });
}

export function useVoidEstimate(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPatch(`/api/tenant/estimates/${estimateId}/void`, { confirmed: true as const });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Void failed');
      }
      return (await res.json()) as { data: Record<string, unknown> };
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
      await qc.cancelQueries({ queryKey: ['tenant-estimate-composer', estimateId] });
      const prev = qc.getQueryData<TenantEstimateDetailResponse>(['tenant-estimate-detail', estimateId]);
      const prevComposer = qc.getQueryData<TenantEstimateDetailResponse>(['tenant-estimate-composer', estimateId]);
      const stamp = new Date().toISOString();
      if (prev) {
        qc.setQueryData(['tenant-estimate-detail', estimateId], { ...prev, status: 'void', voided_at: stamp });
      }
      if (prevComposer) {
        qc.setQueryData(['tenant-estimate-composer', estimateId], { ...prevComposer, status: 'void', voided_at: stamp });
      }
      return { prev, prevComposer };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(['tenant-estimate-detail', estimateId], ctx.prev);
      }
      if (ctx?.prevComposer) {
        qc.setQueryData(['tenant-estimate-composer', estimateId], ctx.prevComposer);
      }
      toast.error(_err instanceof Error ? _err.message : 'Void failed');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-composer', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimates'] });
    },
  });
}

export function useDuplicateEstimate(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost(`/api/tenant/estimates/${estimateId}/duplicate`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Duplicate failed');
      }
      return (await res.json()) as { data: Record<string, unknown> };
    },
    onSuccess: () => {
      toast.success('Estimate duplicated');
      void qc.invalidateQueries({ queryKey: ['tenant-estimates'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Duplicate failed');
    },
  });
}

export function useEstimateSellerNote(estimateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seller_note: string) => {
      const res = await apiPatch(`/api/tenant/estimates/${estimateId}`, { seller_note });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Save failed');
      }
    },
    onSuccess: () => {
      toast.success('Note saved');
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    },
  });
}

export function useEstimateComposer(estimateId: string | null) {
  return useQuery({
    queryKey: ['tenant-estimate-composer', estimateId],
    queryFn: () => fetchTenantEstimateDetail(estimateId!),
    enabled: Boolean(estimateId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSaveEstimateComposer(estimateId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EstimateComposerSavePayload) => {
      if (!estimateId) throw new Error('Missing estimate id');
      const res = await apiPatch(`/api/tenant/estimates/${estimateId}`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to save estimate');
      }
      return (await res.json()) as { data: EstimateComposerDocument };
    },
    onSuccess: (payload) => {
      if (!estimateId) return;
      qc.setQueryData(['tenant-estimate-composer', estimateId], payload.data);
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimates'] });
    },
  });
}

export function useSendEstimate(estimateId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { channel: EstimateSendChannel; recipient: string; message: string }) => {
      if (!estimateId) throw new Error('Missing estimate id');
      const res = await apiPatch(`/api/tenant/estimates/${estimateId}/send`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to send estimate');
      }
      return (await res.json()) as { data: { id: string } };
    },
    onMutate: async (payload) => {
      if (!estimateId) return {};
      await qc.cancelQueries({ queryKey: ['tenant-estimate-composer', estimateId] });
      const prev = qc.getQueryData<EstimateComposerDocument>(['tenant-estimate-composer', estimateId]);
      const sentAt = new Date().toISOString();
      if (prev) {
        qc.setQueryData<EstimateComposerDocument>(['tenant-estimate-composer', estimateId], {
          ...prev,
          status: 'sent',
          sent_at: sentAt,
          sent_channel: payload.channel,
        });
      }
      return { prev };
    },
    onError: (e, _p, ctx) => {
      if (estimateId && ctx?.prev) {
        qc.setQueryData(['tenant-estimate-composer', estimateId], ctx.prev);
      }
      toast.error(e instanceof Error ? e.message : 'Failed to send estimate');
    },
    onSuccess: () => {
      toast.success('Estimate sent');
      if (!estimateId) return;
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-composer', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimate-detail', estimateId] });
      void qc.invalidateQueries({ queryKey: ['tenant-estimates'] });
    },
  });
}

export function useBuyerEstimateContext(buyerId: string | null) {
  return useQuery({
    queryKey: ['estimate-buyer-context', buyerId],
    queryFn: async (): Promise<EstimateComposerBuyerContext> => {
      const res = await apiFetch(`/api/tenant/buyers/${buyerId}/context`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch buyer context');
      }
      const json = (await res.json()) as { data: EstimateComposerBuyerContext };
      return json.data;
    },
    enabled: Boolean(buyerId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useEstimateProductSearch(
  query: string,
  buyerId: string | null,
  open = false,
  priceListId?: string | null,
) {
  const debounced = useDebounce(query, 300);

  return useQuery({
    queryKey: ['estimate-product-search', debounced, buyerId, open, priceListId ?? null],
    queryFn: async (): Promise<EstimateComposerProductSearchRow[]> => {
      const params = new URLSearchParams({ q: debounced });
      if (buyerId) params.set('buyerId', buyerId);
      if (priceListId) params.set('priceListId', priceListId);
      const res = await apiFetch(`/api/tenant/products/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to search products');
      }
      const json = (await res.json()) as { products: EstimateComposerProductSearchRow[] };
      return json.products;
    },
    enabled: open && Boolean(buyerId),
    staleTime: 30_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useNextEstimateNumber(enabled: boolean) {
  return useQuery({
    queryKey: ['next-estimate-number'],
    queryFn: async (): Promise<string> => {
      const res = await apiFetch('/api/tenant/estimates/next-number');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch next estimate number');
      }
      const json = (await res.json()) as { estimate_number: string };
      return json.estimate_number;
    },
    enabled,
    staleTime: 30_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useEstimateProductPricing(
  buyerId: string | null,
  productIds: string[],
  priceListId?: string | null,
) {
  const stableIds = [...productIds].sort();

  return useQuery({
    queryKey: ['estimate-product-pricing', buyerId, priceListId ?? null, stableIds.join(',')],
    queryFn: async (): Promise<Record<string, number>> => {
      const params = new URLSearchParams();
      params.set('ids', stableIds.join(','));
      if (buyerId) params.set('buyerId', buyerId);
      if (priceListId) params.set('priceListId', priceListId);

      const res = await apiFetch(`/api/tenant/products/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch product pricing');
      }

      const json = (await res.json()) as { products: EstimateComposerProductSearchRow[] };
      return (json.products ?? []).reduce<Record<string, number>>((acc, product) => {
        acc[product.tenant_product_id] = product.unit_price;
        return acc;
      }, {});
    },
    enabled: stableIds.length > 0 && (Boolean(buyerId) || Boolean(priceListId)),
    staleTime: 30_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useEstimatePriceListOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['estimate-price-list-options'],
    queryFn: async (): Promise<EstimateComposerPriceListOption[]> => {
      const res = await apiFetch('/api/price-lists');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch price lists');
      }

      const json = (await res.json()) as {
        price_lists?: Array<{ id: string; name: string }>;
      };

      return (json.price_lists ?? []).map((row) => ({
        id: row.id,
        name: row.name,
      }));
    },
    enabled,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}
