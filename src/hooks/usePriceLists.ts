'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { apiFetch, apiPost } from '@/lib/api-fetch';
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

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
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

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list-assignments', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      toast.success('Assignment removed');
    },
  });
}
