'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots, type OptimisticSnapshot } from '@/lib/optimistic';
import type { PriceListAssignmentInput, PriceListCreateInput, PriceListItemCreateInput } from '@/lib/zod';

export interface PriceList {
  id: string;
  name: string;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export type PriceListLandingStatus = 'active' | 'draft' | 'expired';
export type PriceListLandingStatusTone = 'success' | 'warning' | 'neutral';

export interface PriceListLandingRow {
  id: string;
  name: string;
  priority: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  updated_at: string;
  created_at: string;
  status: PriceListLandingStatus;
  status_tone: PriceListLandingStatusTone;
  cohorts_count: number;
  cohort_names: string[];
  product_count: number;
  avg_discount_pct: number | null;
  created_by_label: string;
  is_expiring_soon: boolean;
}

export interface PriceListsLandingResponse {
  kpis: {
    active_lists: number;
    draft_lists: number;
    expiring_soon: number;
    cohorts_covered: number;
    cohorts_total: number;
    products_with_overrides: number;
  };
  todays_read: {
    expiring_soon: Array<{
      id: string;
      name: string;
      initials: string;
      valid_until: string | null;
      valid_until_label: string;
      cohorts_count: number;
      status: PriceListLandingStatus;
      status_tone: PriceListLandingStatusTone;
    }>;
    most_coverage: Array<{
      id: string;
      name: string;
      initials: string;
      product_count: number;
      valid_until: string | null;
      valid_until_label: string;
    }>;
    uncovered_cohorts: Array<{
      id: string;
      name: string;
      initials: string;
      member_count: number;
    }>;
  };
  price_lists: PriceListLandingRow[];
  cohorts_total: number;
  counts: {
    active: number;
    draft: number;
    expired: number;
  };
}

export interface PriceListItem {
  id: string;
  price_list_id: string;
  tenant_product_id: string;
  price: number;
  min_qty: number;
  max_qty: number | null;
  tenant_product?: {
    id: string;
    internal_sku: string;
    name_override: string | null;
    mrp: number | null;
    base_selling_price: number | null;
    master_product: { name: string } | null;
  };
}

export interface PriceListAssignment {
  id: string;
  price_list_id: string;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  target_id: string | null;
  created_at: string;
}

export interface PriceListDetail extends PriceList {
  items: PriceListItem[];
  assignments: PriceListAssignment[];
}

export function usePriceLists() {
  return useQuery({
    queryKey: ['price-lists'],
    queryFn: async (): Promise<{ price_lists: PriceList[] }> => {
      const res = await apiFetch('/api/price-lists');
      if (!res.ok) {
        throw new Error('Failed to fetch price lists');
      }
      return res.json();
    },
  });
}

export function usePriceListsLanding() {
  return useQuery({
    queryKey: ['price-lists-landing'],
    queryFn: async (): Promise<PriceListsLandingResponse> => {
      const res = await apiFetch('/api/price-lists');
      if (!res.ok) {
        throw new Error('Failed to fetch price lists landing');
      }
      return res.json();
    },
  });
}

export function useCreatePriceList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PriceListCreateInput): Promise<{ price_list: PriceList }> => {
      const res = await apiPost('/api/price-lists', data);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to create price list');
      }

      return res.json() as Promise<{ price_list: PriceList }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [['price-lists']]);
      queryClient.setQueryData<{ price_lists: PriceList[] }>(['price-lists'], (old) => ({
        price_lists: [
          {
            id: `optimistic-${Date.now()}`,
            name: data.name,
            currency: data.currency,
            valid_from: data.valid_from ? new Date(data.valid_from).toISOString() : null,
            valid_to: data.valid_to ? new Date(data.valid_to).toISOString() : null,
            priority: data.priority,
            is_active: true,
            tenant_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...(old?.price_lists ?? []),
        ],
      }));
      return { snapshots };
    },

    onError: (_error, _data, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-lists-landing'] });
      toast.success('Price list created');
    },
  });
}

export function usePriceListDetail(id: string) {
  return useQuery({
    queryKey: ['price-list', id],
    queryFn: async (): Promise<{ price_list: PriceListDetail }> => {
      const res = await apiFetch(`/api/price-lists/${id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch price list');
      }
      return res.json();
    },
    enabled: !!id,
  });
}

export function usePriceListItems(priceListId: string) {
  return useQuery({
    queryKey: ['price-list-items', priceListId],
    queryFn: async (): Promise<{ items: PriceListItem[] }> => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items`);
      if (!res.ok) {
        throw new Error('Failed to fetch price list items');
      }
      return res.json();
    },
    enabled: !!priceListId,
  });
}

export function useAddPriceListItem(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PriceListItemCreateInput): Promise<{ item: PriceListItem }> => {
      const res = await apiPost(`/api/price-lists/${priceListId}/items`, data);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to add item');
      }

      return res.json() as Promise<{ item: PriceListItem }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-items', priceListId],
        ['price-list', priceListId],
      ]);
      const optimisticItem: PriceListItem = {
        id: `optimistic-${Date.now()}`,
        price_list_id: priceListId,
        tenant_product_id: data.tenant_product_id,
        price: data.price,
        min_qty: data.min_qty ?? 1,
        max_qty: data.max_qty ?? null,
      };
      queryClient.setQueryData<{ items: PriceListItem[] }>(['price-list-items', priceListId], (old) => ({
        items: [optimisticItem, ...(old?.items ?? [])],
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            items: [optimisticItem, ...(old.price_list.items ?? [])],
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _data, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Product added to price list');
    },
  });
}

export function useDeletePriceListItem(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string): Promise<void> => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to delete item');
      }
    },

    onMutate: async (itemId) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-items', priceListId],
        ['price-list', priceListId],
      ]);
      queryClient.setQueryData<{ items: PriceListItem[] }>(['price-list-items', priceListId], (old) => ({
        items: (old?.items ?? []).filter((item) => item.id !== itemId),
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            items: (old.price_list.items ?? []).filter((item) => item.id !== itemId),
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _itemId, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Item removed');
    },
  });
}

export function usePriceListAssignments(priceListId: string) {
  return useQuery({
    queryKey: ['price-list-assignments', priceListId],
    queryFn: async (): Promise<{ assignments: PriceListAssignment[] }> => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/assignments`);
      if (!res.ok) {
        throw new Error('Failed to fetch assignments');
      }
      return res.json();
    },
    enabled: !!priceListId,
  });
}

export function useAddAssignment(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PriceListAssignmentInput): Promise<{ assignment: PriceListAssignment }> => {
      const res = await apiPost(`/api/price-lists/${priceListId}/assignments`, data);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        const err = new Error((body as { error?: string }).error ?? 'Failed to add assignment');
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }

      return res.json() as Promise<{ assignment: PriceListAssignment }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-assignments', priceListId],
        ['price-list', priceListId],
      ]);
      const optimisticAssignment: PriceListAssignment = {
        id: `optimistic-${Date.now()}`,
        price_list_id: priceListId,
        target_type: data.target_type,
        target_id: data.target_id ?? null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<{ assignments: PriceListAssignment[] }>(['price-list-assignments', priceListId], (old) => ({
        assignments: [optimisticAssignment, ...(old?.assignments ?? [])],
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            assignments: [optimisticAssignment, ...(old.price_list.assignments ?? [])],
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _data, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-assignments', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Assignment added');
    },
  });
}

export function useResolvePrice(tenantProductId: string, buyerId: string, qty: number = 1) {
  return useQuery({
    queryKey: ['resolve-price', tenantProductId, buyerId, qty],
    queryFn: async (): Promise<{ price: number | null }> => {
      const supabase = createClientComponentClient();
      const { data, error } = await (supabase as ReturnType<typeof createClientComponentClient> & { schema: (s: string) => ReturnType<typeof createClientComponentClient> })
        .schema('app')
        .rpc('resolve_price', {
          p_tenant_product_id: tenantProductId,
          p_buyer_id: buyerId,
          p_qty: qty,
        });
      if (error) throw error;
      return { price: data as number | null };
    },
    enabled: !!tenantProductId && !!buyerId,
    staleTime: 30_000,
  });
}

export function useTogglePriceListActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await apiFetch(`/api/price-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to update price list');
      }
      return res.json() as Promise<{ price_list: PriceList }>;
    },
    onMutate: async ({ id, is_active }) => {
      const snapshots = await takeSnapshots(queryClient, [['price-lists'], ['price-list', id]]);
      queryClient.setQueryData<{ price_lists: PriceList[] }>(['price-lists'], (old) => ({
        price_lists: (old?.price_lists ?? []).map((priceList) =>
          priceList.id === id ? { ...priceList, is_active } : priceList,
        ),
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', id], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            is_active,
          },
        };
      });
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots as OptimisticSnapshot[]),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['price-list', id] });
      toast.success('Price list updated');
    },
  });
}

export function useDeleteAssignment(priceListId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string): Promise<void> => {
      const res = await apiFetch(
        `/api/price-lists/${priceListId}/assignments/${assignmentId}`,
        { method: 'DELETE' },
      );

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((body as { error?: string }).error ?? 'Failed to remove assignment');
      }
    },

    onMutate: async (assignmentId) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['price-list-assignments', priceListId],
        ['price-list', priceListId],
      ]);
      queryClient.setQueryData<{ assignments: PriceListAssignment[] }>(['price-list-assignments', priceListId], (old) => ({
        assignments: (old?.assignments ?? []).filter((assignment) => assignment.id !== assignmentId),
      }));
      queryClient.setQueryData<{ price_list: PriceListDetail }>(['price-list', priceListId], (old) => {
        if (!old?.price_list) return old;
        return {
          price_list: {
            ...old.price_list,
            assignments: (old.price_list.assignments ?? []).filter((assignment) => assignment.id !== assignmentId),
          },
        };
      });
      return { snapshots };
    },

    onError: (_error, _assignmentId, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-assignments', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Assignment removed');
    },
  });
}
