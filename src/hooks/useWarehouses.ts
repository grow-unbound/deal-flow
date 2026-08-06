'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  WarehousesLandingMetricsV4,
} from '@/types/tenant-warehouses';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';
import { REFERENCE_QUERY_STALE_TIME, REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';

export interface WarehousesLandingFilters {
  search?: string;
  status?: string[];
  stock?: string[];
  sort?: string;
  filter_preset?: Record<string, unknown> | null;
}

export function useWarehousesLandingMetrics(initialData?: WarehousesLandingMetricsV4 | null) {
  const { currentTenantId } = useAuth();
  return useQuery<WarehousesLandingMetricsV4>({
    queryKey: ['warehouses-landing-metrics-v4', currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async () => {
      const res = await apiFetch('/api/tenant/warehouses/metrics');
      if (!res.ok) throw new Error('Failed to fetch warehouses metrics');
      return res.json() as Promise<WarehousesLandingMetricsV4>;
    },
    initialData: initialData ?? undefined,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
}

export function useWarehousesLanding(
  period: SellerLandingPeriod,
  filters: WarehousesLandingFilters = {},
  initialData: WarehousesLandingResponse | null,
) {
  const { currentTenantId } = useAuth();
  const baseSummary = initialData?.period_key === 'this_quarter' ? initialData : null;
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;

  const query = useInfiniteQuery<WarehousesLandingResponse>({
    queryKey: ['warehouses-landing', currentTenantId, period, {
      search: filters.search ?? '',
      status: filters.status ?? [],
      stock: filters.stock ?? [],
      sort: filters.sort ?? 'invoice_value_desc',
      filter_preset: presetKey,
    }],
    enabled: Boolean(currentTenantId),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ period, limit: '50' });
      if (pageParam) params.set('cursor', String(pageParam));
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'stock', filters.stock);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
      const res = await apiFetch(`/api/tenant/warehouses/landing?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`warehouses-landing ${res.status}`);
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: baseSummary ? { pages: [baseSummary], pageParams: [undefined] } : undefined,
    initialDataUpdatedAt: baseSummary ? 0 : undefined,
    placeholderData: keepPreviousData,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'warehouses');
  return { ...query, data: merged && baseSummary ? { ...baseSummary, ...merged } : merged };
}

export function useWarehouseDetail(id: string) {
  const { currentTenantId } = useAuth();

  return useQuery<WarehouseDetailResponse>({
    queryKey: ['warehouse-detail', currentTenantId, id],
    enabled: Boolean(currentTenantId) && Boolean(id),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/warehouses/${id}`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error(`warehouse-detail ${res.status}`);
      return res.json() as Promise<WarehouseDetailResponse>;
    },
  });
}

export interface WarehouseStockFilters {
  query?: string;
  statuses?: string[];
  sort?: string;
}

export function useWarehouseStock(warehouseId: string, filters: WarehouseStockFilters = {}, enabled = true) {
  const { currentTenantId } = useAuth();

  return useInfiniteQuery<WarehouseStockPageResponse>({
    queryKey: ['warehouse-stock', currentTenantId, warehouseId, filters],
    enabled: Boolean(currentTenantId) && Boolean(warehouseId) && enabled,
    staleTime: 30_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        page_size: '50',
      });
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      if (filters.sort) params.set('sort', filters.sort);
      for (const status of filters.statuses ?? []) params.append('status', status);
      const res = await apiFetch(`/api/tenant/warehouses/${warehouseId}/stock?${params.toString()}`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error(`warehouse-stock ${res.status}`);
      const json = (await res.json()) as { data: WarehouseStockPageResponse; error: unknown };
      if (!json.data) throw new Error('Invalid response');
      return json.data;
    },
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
    placeholderData: keepPreviousData,
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
