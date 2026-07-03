'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPost } from '@/lib/api-fetch';
import type { TenantWarehouse } from '@/types/tenant-warehouses';

export interface InventoryRow {
  id: string;
  tenant_product_id: string;
  warehouse_id: string;
  qty_available: number;
  qty_reserved: number;
  reorder_point?: number | null;
  updated_at: string;
  warehouse?: { id: string; name: string; is_default: boolean; location_id: string | null } | null;
}

export interface UpsertInventoryInput {
  tenant_product_id: string;
  warehouse_id: string;
  qty_available: number;
  qty_reserved: number;
  reorder_point?: number | null;
}

function parseWarehousesPayload(json: unknown): { warehouses: TenantWarehouse[] } {
  const o = json as Record<string, unknown>;
  if (o.data && typeof o.data === 'object' && o.data !== null && 'warehouses' in o.data) {
    return { warehouses: (o.data as { warehouses: TenantWarehouse[] }).warehouses };
  }
  if ('warehouses' in o && Array.isArray(o.warehouses)) {
    return { warehouses: o.warehouses as TenantWarehouse[] };
  }
  return { warehouses: [] };
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

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await apiFetch('/api/tenant/warehouses');
      if (!res.ok) throw new Error('Failed to fetch warehouses');
      return parseWarehousesPayload(await res.json());
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
      queryClient.invalidateQueries({ queryKey: ['inventory', tenant_product_id] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to update inventory');
    },
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; address?: object; is_default?: boolean }) => {
      const res = await apiPost('/api/tenant/warehouses', data);
      const json = (await res.json()) as { data?: { warehouse: TenantWarehouse }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create warehouse');
      }
      if (!json.data?.warehouse) {
        throw new Error('Invalid response');
      }
      return json.data.warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to create warehouse');
    },
  });
}
