'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateBrandInput } from '@/lib/zod';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';

export interface MasterBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
}

export interface TenantBrand {
  id: string;
  tenant_id: string;
  master_brand_id: string;
  display_name_override: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  master_brand: MasterBrand | null;
  gmv_mtd?: number;
  gmv_prev_mtd?: number;
  growth_pct?: number;
  portfolio_share_pct?: number;
  sku_count?: number;
  active_buyers_mtd?: number;
  total_buyers?: number;
  catalog_days_ago?: number | null;
  catalog_name?: string | null;
  categories?: string[];
  alerts?: string[];
}

export interface BrandsKpis {
  portfolio_gmv_mtd: number;
  portfolio_gmv_prev_mtd: number;
  brands_carried: number;
  buyers_with_orders_mtd: number;
  total_buyers: number;
  need_attention_count: number;
  catalog_freshness_count: number;
  total_published_catalogs?: number;
  catalog_freshness_earliest_days: number | null;
}

export interface TodaysReadItem {
  id: string;
  name: string;
  growth_pct: number;
  alerts: string[];
}

export interface TopPerformerItem {
  id: string;
  name: string;
  gmv_mtd: number;
}

export interface TopRiserItem {
  id: string;
  name: string;
  growth_pct: number;
  gmv_mtd: number;
  gmv_prev_mtd: number;
}

export interface TenantBrandsResponse {
  brands: TenantBrand[];
  categories?: string[];
  kpis?: BrandsKpis;
  todays_read?: {
    needs_attention: TodaysReadItem[];
    top_performers: TopPerformerItem[];
    top_risers: TopRiserItem[];
  };
  period?: {
    timezone: string;
    current_month_start: string;
    current_month_end_exclusive: string;
    previous_mtd_start: string;
    previous_mtd_end_exclusive: string;
  };
}

export interface SearchBrandsResponse {
  brands: MasterBrand[];
}

export interface AddBrandPayload {
  master_brand_id: string;
  display_name_override?: string;
}

export interface BrandDetailHeader {
  id: string;
  brand_name: string;
  category: string;
  region: string;
  carried_since: string;
  skus: number;
  portfolio_share_pct: number;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral';
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
}

export interface BrandDetailMetaStrip {
  gmv_mtd: number;
  growth_pct: number;
  active_buyers: number;
  total_buyers: number;
  low_stock_skus: number;
  days_since_catalog: number | null;
  last_sent_date: string | null;
  latest_catalog_name: string | null;
}

export interface BrandDetailRow {
  id: string;
  tenant_id: string;
  master_brand_id: string;
  display_name_override: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BrandDetailBuyer {
  id: string;
  name: string;
  cohort: string;
  spend: number;
  orders: number;
  last_order: string | null;
  status: string;
  city: string;
}

export interface BrandDetailCatalog {
  id: string;
  name: string;
  cohort: string;
  gmv: number;
  orders: number;
  status: string;
  sent_at: string;
}

export interface BrandDetailActivity {
  id: string;
  at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  diff: Record<string, unknown> | null;
}

export interface BrandDetailResponse {
  header: BrandDetailHeader;
  meta_strip_4: BrandDetailMetaStrip;
  details: BrandDetailRow;
  performance: {
    monthly_trend: Array<{ month: string; revenue: number }>;
    cohort_breakdown: Array<{ cohort: string; spend: number }>;
    top_skus: Array<{
      product_id: string;
      product: string;
      sku?: string;
      units: number;
      revenue: number;
      growth: number;
      days_cover: number | null;
      status: string;
    }>;
    top_buyers: Array<BrandDetailBuyer & { orders_label: string }>;
    catalog_history: BrandDetailCatalog[];
    insights: {
      margin_avg_pct: number;
      sell_through_pct: number;
      repeat_rate_pct: number;
      buyer_reach: string;
    };
  };
  buyers: BrandDetailBuyer[];
  catalogs: BrandDetailCatalog[];
  activity: BrandDetailActivity[];
}

export interface UpdateTenantBrandInput {
  display_name_override?: string | null;
  margin_pct?: number | null;
  exclusivity?: boolean | null;
  external_ref?: string | null;
  is_active?: boolean;
  archive?: boolean;
}

export function useTenantBrands() {
  return useQuery({
    queryKey: ['tenant-brands'],
    queryFn: async (): Promise<TenantBrandsResponse> => {
      const res = await apiFetch('/api/tenant/brands');
      if (!res.ok) {
        throw new Error('Failed to fetch brands');
      }
      return res.json();
    },
  });
}

export function useTenantBrandDetail(id: string) {
  return useQuery({
    queryKey: ['tenant-brand-detail', id],
    queryFn: async (): Promise<BrandDetailResponse> => {
      const res = await apiFetch(`/api/tenant/brands/${id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch brand detail');
      }
      return res.json();
    },
    enabled: Boolean(id),
  });
}

export function useSearchMasterBrands(query: string) {
  return useQuery({
    queryKey: ['master-brands-search', query],
    queryFn: async (): Promise<SearchBrandsResponse> => {
      const params = new URLSearchParams({ q: query });
      const res = await apiFetch(`/api/brands/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to search brands');
      }
      return res.json();
    },
    enabled: query.length >= 1,
    staleTime: 30_000,
  });
}

export function useAddBrandToTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AddBrandPayload): Promise<TenantBrand> => {
      const res = await apiPost('/api/tenant/brands', payload);

      if (res.status === 409) {
        throw new Error('Brand already in your catalog');
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to add brand');
      }

      const data = await res.json();
      return data.brand as TenantBrand;
    },

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-brands'] });
      const prev = queryClient.getQueryData<TenantBrandsResponse>(['tenant-brands']);

      const optimisticBrand: TenantBrand = {
        id: `optimistic-${Date.now()}`,
        tenant_id: '',
        master_brand_id: payload.master_brand_id,
        display_name_override: payload.display_name_override ?? null,
        margin_pct: null,
        exclusivity: null,
        is_active: true,
        external_ref: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        master_brand: null,
      };

      queryClient.setQueryData<TenantBrandsResponse>(['tenant-brands'], (old) => ({
        brands: [optimisticBrand, ...(old?.brands ?? [])],
      }));

      return { prev };
    },

    onError: (_err, _payload, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['tenant-brands'], context.prev);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-brands'] });
    },

    onSuccess: () => {
      toast.success('Brand added to your catalog');
    },
  });
}

export function useUpdateTenantBrand(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateTenantBrandInput) => {
      const res = await apiFetch(`/api/tenant/brands/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to update brand');
      }

      return res.json() as Promise<{ brand: BrandDetailRow }>;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-brand-detail', id], ['tenant-brands']]);
      queryClient.setQueryData<BrandDetailResponse>(['tenant-brand-detail', id], (old) =>
        old
          ? {
              ...old,
              details: { ...old.details, ...payload },
            }
          : old,
      );
      queryClient.setQueryData<TenantBrandsResponse>(['tenant-brands'], (old) => ({
        ...old,
        brands: (old?.brands ?? []).map((brand) =>
          brand.id === id
            ? {
                ...brand,
                display_name_override:
                  payload.display_name_override === undefined
                    ? brand.display_name_override
                    : payload.display_name_override,
                margin_pct: payload.margin_pct === undefined ? brand.margin_pct : payload.margin_pct,
                exclusivity:
                  payload.exclusivity === undefined ? brand.exclusivity : payload.exclusivity,
                external_ref:
                  payload.external_ref === undefined ? brand.external_ref : payload.external_ref,
                is_active: payload.is_active === undefined ? brand.is_active : payload.is_active,
                updated_at: new Date().toISOString(),
              }
            : brand,
        ),
      }));
      return { snapshots };
    },
    onError: (_error, _payload, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-brand-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-brands'] });
      toast.success('Brand details updated');
    },
  });
}

export function useArchiveTenantBrand(id: string) {
  const mutation = useUpdateTenantBrand(id);
  return {
    ...mutation,
    archive: () => mutation.mutate({ archive: true }),
  };
}

export interface CreateCustomBrandError {
  status: number;
  error: string;
  details?: unknown;
}

export function useCreateCustomBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBrandInput): Promise<{ brand: TenantBrand }> => {
      const res = await apiPost('/api/brands/custom', data);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw { status: res.status, ...(err as object) } as CreateCustomBrandError;
      }

      return res.json() as Promise<{ brand: TenantBrand }>;
    },

    onMutate: async (data) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-brands']]);
      const optimisticBrand: TenantBrand = {
        id: `optimistic-${Date.now()}`,
        tenant_id: '',
        master_brand_id: '',
        display_name_override: data.name,
        margin_pct: null,
        exclusivity: null,
        is_active: true,
        external_ref: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        master_brand: {
          id: `optimistic-master-${Date.now()}`,
          name: data.name,
          slug: data.slug,
          logo_url: data.logo_url ?? null,
          description: data.description ?? null,
        },
      };
      queryClient.setQueryData<TenantBrandsResponse>(['tenant-brands'], (old) => ({
        ...old,
        brands: [optimisticBrand, ...(old?.brands ?? [])],
      }));
      return { snapshots };
    },
    onError: (_error, _data, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-brands'] });
    },
  });
}
