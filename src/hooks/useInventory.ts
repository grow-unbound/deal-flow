'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Location {
  id: string;
  name: string;
  address?: Record<string, string>;
  is_default: boolean;
  tenant_id: string;
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
      const res = await fetch('/api/tenant/locations');
      if (!res.ok) throw new Error('Failed to fetch locations');
      return res.json() as Promise<{ locations: Location[] }>;
    },
  });
}

export function useInventoryByProduct(productId: string) {
  return useQuery({
    queryKey: ['inventory', productId],
    queryFn: async () => {
      const res = await fetch(`/api/tenant/inventory?product_id=${productId}`);
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
      const res = await fetch('/api/tenant/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update inventory');
      return res.json();
    },
    onSuccess: (_, { tenant_product_id }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', tenant_product_id] });
    },
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; address?: object; is_default?: boolean }) => {
      const res = await fetch('/api/tenant/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create location');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}
