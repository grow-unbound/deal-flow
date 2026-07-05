'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type {
  CreateWarehouseInput,
  TenantWarehouse,
  UpdateWarehouseInput,
  WarehouseDetailResponse,
  WarehouseStockPageResponse,
  WarehousesLandingResponse,
} from '@/types/tenant-warehouses';

export interface WarehousesLandingFilters {
  search?: string;
  status?: string[];
  stock?: string[];
}

export function useWarehousesLanding(
  period: SellerLandingPeriod,
  filters: WarehousesLandingFilters = {},
  initialData: WarehousesLandingResponse | null,
) {
  const { currentTenantId } = useAuth();

  return useQuery<WarehousesLandingResponse>({
    queryKey: ['warehouses-landing', currentTenantId, period, filters],
    enabled: Boolean(currentTenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ period, limit: '50' });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'stock', filters.stock);
      const res = await apiFetch(`/api/tenant/warehouses/landing?${params.toString()}`);
      if (!res.ok) throw new Error(`warehouses-landing ${res.status}`);
      return res.json() as Promise<WarehousesLandingResponse>;
    },
    initialData: initialData ?? undefined,
  });
}

export function useWarehouseDetail(id: string) {
  const { currentTenantId } = useAuth();

  return useQuery<WarehouseDetailResponse>({
    queryKey: ['warehouse-detail', currentTenantId, id],
    enabled: Boolean(currentTenantId) && Boolean(id),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/warehouses/${id}`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error(`warehouse-detail ${res.status}`);
      return res.json() as Promise<WarehouseDetailResponse>;
    },
  });
}

export function useWarehouseStock(warehouseId: string, enabled = true) {
  const { currentTenantId } = useAuth();

  return useInfiniteQuery<WarehouseStockPageResponse>({
    queryKey: ['warehouse-stock', currentTenantId, warehouseId],
    enabled: Boolean(currentTenantId) && Boolean(warehouseId) && enabled,
    staleTime: 30_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        page_size: '50',
      });
      const res = await apiFetch(`/api/tenant/warehouses/${warehouseId}/stock?${params.toString()}`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error(`warehouse-stock ${res.status}`);
      const json = (await res.json()) as { data: WarehouseStockPageResponse; error: unknown };
      if (!json.data) throw new Error('Invalid response');
      return json.data;
    },
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
  });
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWarehouseInput) => {
      const res = await apiPost('/api/tenant/warehouses', input);
      const json = (await res.json()) as { data?: { warehouse: TenantWarehouse }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to create warehouse');
      }
      if (!json.data?.warehouse) throw new Error('Invalid response');
      return json.data.warehouse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      void queryClient.invalidateQueries({ queryKey: ['warehouses-landing'] });
      toast.success('Warehouse added');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create warehouse');
    },
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateWarehouseInput }) => {
      const res = await apiPatch(`/api/tenant/warehouses/${id}`, patch);
      const json = (await res.json()) as { data?: { warehouse: TenantWarehouse }; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to update warehouse');
      }
      if (!json.data?.warehouse) throw new Error('Invalid response');
      return json.data.warehouse;
    },
    onSuccess: (warehouse) => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      void queryClient.invalidateQueries({ queryKey: ['warehouses-landing'] });
      void queryClient.invalidateQueries({ queryKey: ['warehouse-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] });
      toast.success('Warehouse updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update warehouse');
    },
  });
}

export function useWarehouseReference(id: string) {
  const { currentTenantId } = useAuth();

  return useQuery({
    queryKey: ['warehouse-reference', currentTenantId, id],
    enabled: Boolean(currentTenantId) && Boolean(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/warehouses?include_deleted=1`);
      if (!res.ok) throw new Error('Failed to fetch warehouses');
      const json = (await res.json()) as Record<string, unknown>;
      const rows = ((json.data as { warehouses?: TenantWarehouse[] } | undefined)?.warehouses ?? []) as TenantWarehouse[];
      return rows.find((row) => row.id === id) ?? null;
    },
  });
}
