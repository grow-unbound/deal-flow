'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { rollbackSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_STALE_TIME, NAVIGATION_QUERY_GC_TIME } from '@/lib/query-navigation';

export interface AccessKpis {
  enabled_count: number;
  not_enabled_count: number;
  suggested_count: number;
  inactive_count: number;
  total_count: number;
}

export interface AccessBuyer {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  buyer_app_enabled: boolean;
  last_app_order_at: string | null;
  offline_spend_90d: number;
  total_spend_90d: number;
  app_gmv_90d: number;
  is_suggested: boolean;
  is_inactive: boolean;
}

export interface AccessPageResponse {
  summary_authoritative: boolean;
  kpis: AccessKpis | null;
  buyers: AccessBuyer[];
  filtered_count: number;
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface AccessListParams {
  q?: string;
  status?: 'all' | 'enabled' | 'disabled' | 'suggested' | 'inactive';
  lastOrdered?: 'all' | '30d' | '90d' | 'dormant';
  sort?: 'business_name' | 'app_gmv' | 'offline_spend' | 'last_ordered';
  limit: number;
}

type AccessInfiniteData = InfiniteData<AccessPageResponse, number>;

const ACCESS_QUERY_KEY = ['buyer-app-access'] as const;
const ACCESS_LIST_QUERY_KEY = [...ACCESS_QUERY_KEY, 'list'] as const;
const ACCESS_SUMMARY_QUERY_KEY = [...ACCESS_QUERY_KEY, 'summary'] as const;

export function useAccessList(
  params: AccessListParams,
  initialData?: AccessPageResponse | null,
) {
  const q = params.q?.trim() ?? '';
  const status = params.status ?? 'all';
  const lastOrdered = params.lastOrdered ?? 'all';
  const sort = params.sort ?? 'business_name';
  const queryParams = { q, status, lastOrdered, sort, limit: params.limit };
  const canUseInitialData =
    q === ''
    && status === 'all'
    && lastOrdered === 'all'
    && sort === 'business_name'
    && (initialData?.limit == null || initialData.limit === params.limit);

  const summaryQuery = useQuery<AccessKpis>({
    queryKey: ACCESS_SUMMARY_QUERY_KEY,
    queryFn: async () => {
      const searchParams = new URLSearchParams({ limit: '1', summary: 'true' });
      const res = await apiFetch(`/api/tenant/buyer-app/access?${searchParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch buyer app access summary');

      const response = await res.json() as AccessPageResponse;
      if (!response.summary_authoritative || !response.kpis) {
        throw new Error('Buyer app access summary was not authoritative');
      }
      return response.kpis;
    },
    initialData: initialData?.summary_authoritative && initialData.kpis
      ? initialData.kpis
      : undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });

  const listQuery = useInfiniteQuery<
    AccessPageResponse,
    Error,
    AccessInfiniteData,
    readonly unknown[],
    number
  >({
    queryKey: [...ACCESS_LIST_QUERY_KEY, queryParams],
    queryFn: async ({ pageParam }) => {
      const searchParams = new URLSearchParams({
        limit: String(params.limit),
        offset: String(pageParam),
        status,
        last_ordered: lastOrdered,
        sort,
        summary: 'false',
      });
      if (q) searchParams.set('q', q);

      const res = await apiFetch(`/api/tenant/buyer-app/access?${searchParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch buyer app access data');
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.buyers.length : undefined,
    initialData: canUseInitialData && initialData
      ? { pages: [initialData], pageParams: [0] }
      : undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });

  return {
    ...listQuery,
    authoritativeKpis: summaryQuery.data ?? null,
  };
}

export function useToggleBuyerAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ buyer_ids, enabled }: { buyer_ids: string[]; enabled: boolean }) => {
      const res = await apiPatch('/api/tenant/buyer-app/access', { buyer_ids, enabled });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to update access');
      }
      return res.json();
    },

    onMutate: async ({ buyer_ids, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ACCESS_LIST_QUERY_KEY });
      const snapshots = queryClient
        .getQueriesData<AccessInfiniteData>({ queryKey: ACCESS_LIST_QUERY_KEY })
        .map(([key, previous]) => ({ key, previous }));

      queryClient.setQueriesData<AccessInfiniteData>({ queryKey: ACCESS_LIST_QUERY_KEY }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            buyers: page.buyers.map((buyer) =>
              buyer_ids.includes(buyer.id)
                ? {
                    ...buyer,
                    buyer_app_enabled: enabled,
                    is_inactive: enabled ? buyer.is_inactive : false,
                    is_suggested: !enabled && buyer.offline_spend_90d > 0,
                  }
                : buyer,
            ),
          })),
        };
      });

      return { snapshots };
    },

    onError: (_error, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error('Failed to update buyer app access');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ACCESS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['buyer-app-landing'] });
    },
  });
}

// Convenience wrapper used by the single-row inline toggle
export function useSingleBuyerToggle() {
  const toggleMutation = useToggleBuyerAccess();

  return {
    toggle: (buyerId: string, enabled: boolean) => {
      const label = enabled ? 'enabled' : 'disabled';
      toggleMutation.mutate(
        { buyer_ids: [buyerId], enabled },
        {
          onSuccess: () => {
            toast.success(`Buyer app access ${label}`, {
              action: {
                label: 'Undo',
                onClick: () => {
                  toggleMutation.mutate({ buyer_ids: [buyerId], enabled: !enabled });
                },
              },
            });
          },
        },
      );
    },
    isPending: toggleMutation.isPending,
  };
}

// Bulk toggle used by the contextual toolbar
export function useBulkToggleAccess() {
  const toggleMutation = useToggleBuyerAccess();

  return {
    bulkToggle: (buyerIds: string[], enabled: boolean, onDone?: () => void) => {
      const n = buyerIds.length;
      const label = enabled ? 'enabled' : 'disabled';
      toggleMutation.mutate(
        { buyer_ids: buyerIds, enabled },
        {
          onSuccess: () => {
            toast.success(`${n} buyer${n === 1 ? '' : 's'} ${label}`, {
              action: {
                label: 'Undo',
                onClick: () => {
                  toggleMutation.mutate({ buyer_ids: buyerIds, enabled: !enabled });
                },
              },
            });
            onDone?.();
          },
        },
      );
    },
    isPending: toggleMutation.isPending,
  };
}
