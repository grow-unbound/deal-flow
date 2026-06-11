'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPost } from '@/lib/api-fetch';

export interface Location {
  id: string;
  name: string;
  address?: Record<string, string>;
  is_default: boolean;
  tenant_id: string;
  type?: string;
  inventory_tracking?: boolean;
  deleted_at?: string | null;
}

export interface InventoryRow {
  id: string;
  tenant_product_id: string;
  location_id: string;
  qty_available: number;
  qty_reserved: number;
  reorder_point?: number | null;
  updated_at: string;
  locations?: { id: string; name: string; is_default: boolean } | null;
}

export interface UpsertInventoryInput {
  tenant_product_id: string;
  location_id: string;
  qty_available: number;
  qty_reserved: number;
  reorder_point?: number | null;
}

function parseLocationsPayload(json: unknown): { locations: Location[] } {
  const o = json as Record<string, unknown>;
  if (o.data && typeof o.data === 'object' && o.data !== null && 'locations' in o.data) {
    return { locations: (o.data as { locations: Location[] }).locations };
  }
  if ('locations' in o && Array.isArray(o.locations)) {
    return { locations: o.locations as Location[] };
  }
  return { locations: [] };
}

/**
 * Computes sellable quantity: qty_available - qty_reserved.
 */
export function computeSellable(row: { qty_available: number; qty_reserved: number }): number {
  return row.qty_available - row.qty_reserved;
}

/**
 * Returns true if the sellable qty is below the reorder_point.
 */
export function isLowStock(row: {
  qty_available: number;
  qty_reserved: number;
  reorder_point?: number | null;
}): boolean {
  if (row.reorder_point == null) return false;
  const sellable = computeSellable(row);
  return sellable < row.reorder_point;
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await apiFetch('/api/tenant/locations');
      if (!res.ok) throw new Error('Failed to fetch locations');
      return parseLocationsPayload(await res.json());
    },
  });
}

export function useInventoryByProduct(productId: string) {
  return useQuery({
    queryKey: ['inventory', productId],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/inventory?product_id=${productId}`);
      if (!res.ok) throw new Error('Failed to fetch inventory');
      return res.json() as Promise<{ inventory: InventoryRow[] }>;
    },
    enabled: !!productId,
  });
}

export function useUpsertInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpsertInventoryInput) => {
      const res = await apiPost('/api/tenant/inventory', data);
      if (!res.ok) throw new Error('Failed to update inventory');
      return res.json();
    },
    onSuccess: (_, { tenant_product_id }) => {
      toast.success('Inventory updated');
      queryClient.invalidateQueries({ queryKey: ['inventory', tenant_product_id] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to update inventory');
    },
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; address?: object; is_default?: boolean }) => {
      const res = await apiPost('/api/tenant/locations', data);
      const json = (await res.json()) as { data?: { location: Location }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create location');
      }
      if (!json.data?.location) {
        throw new Error('Invalid response');
      }
      return json.data.location;
    },
    onSuccess: () => {
      toast.success('Location created');
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-locations'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to create location');
    },
  });
}
