'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { takeSnapshots, rollbackSnapshots } from '@/lib/optimistic';
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
  kpis: AccessKpis;
  buyers: AccessBuyer[];
}

export function useAccessList(initialData?: AccessPageResponse | null) {
  return useQuery<AccessPageResponse>({
    queryKey: ['buyer-app-access'],
    queryFn: async () => {
      const res = await apiFetch('/api/tenant/buyer-app/access');
      if (!res.ok) throw new Error('Failed to fetch buyer app access data');
      return res.json();
    },
    initialData: initialData ?? undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

function recomputeKpis(buyers: AccessBuyer[]): AccessKpis {
  return {
    enabled_count: buyers.filter((b) => b.buyer_app_enabled).length,
    not_enabled_count: buyers.filter((b) => !b.buyer_app_enabled).length,
    suggested_count: buyers.filter((b) => b.is_suggested).length,
    inactive_count: buyers.filter((b) => b.is_inactive).length,
    total_count: buyers.length,
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
      const snapshots = await takeSnapshots(queryClient, [['buyer-app-access']]);

      queryClient.setQueryData<AccessPageResponse>(['buyer-app-access'], (old) => {
        if (!old) return old;
        const updatedBuyers = old.buyers.map((b) =>
          buyer_ids.includes(b.id)
            ? {
                ...b,
                buyer_app_enabled: enabled,
                // a buyer just enabled is not inactive, a disabled buyer loses app GMV display
                is_inactive: enabled ? b.is_inactive : false,
                is_suggested: !enabled && b.offline_spend_90d > 0,
              }
            : b,
        );
        return { kpis: recomputeKpis(updatedBuyers), buyers: updatedBuyers };
      });

      return { snapshots };
    },

    onError: (_error, _vars, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error('Failed to update buyer app access');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['buyer-app-access'] });
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
