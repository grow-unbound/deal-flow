'use client';

import { keepPreviousData, useInfiniteQuery, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { BrandCreateInput, CreateBrandInput, TenantBrandUpdateInput } from '@/lib/zod';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';

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
  master_brand_id: string | null;
  display_name_override: string | null;
  slug?: string | null;
  description?: string | null;
  logo_url: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  principal_name: string | null;
  principal_email: string | null;
  principal_phone: string | null;
  principal_location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_cohort_id: string | null;
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
  total_campaigns?: number;
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
  total?: number;
  limit?: number;
  offset?: number;
  nextOffset?: number | null;
  categories?: string[];
  cohorts?: Array<{
    id: string;
    name: string;
  }>;
  kpis?: BrandsKpis;
  todays_read?: {
    needs_attention: TodaysReadItem[];
    top_performers: TopPerformerItem[];
    top_risers: TopRiserItem[];
  };
  period?: SellerLandingPeriodMeta;
}

export interface TenantBrandsLandingFilters {
  search?: string;
  categories?: string[];
  cohorts?: string[];
}

export interface SearchBrandsResponse {
  brands: MasterBrand[];
}

export interface AddBrandPayload {
  mode: 'import';
  master_brand_id: string;
  display_name_override?: string;
  exclusivity?: boolean | null;
  optimistic_master_brand?: MasterBrand | null;
}

export type CreateTenantBrandPayload = BrandCreateInput & {
  optimistic_master_brand?: MasterBrand | null;
};

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
  master_brand_id: string | null;
  display_name_override: string | null;
  slug?: string | null;
  description?: string | null;
  logo_url: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  principal_name: string | null;
  principal_email: string | null;
  principal_phone: string | null;
  principal_location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_cohort_id: string | null;
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

export interface BrandBuyerPage {
  rows: BrandDetailBuyer[];
  total: number;
  limit: number;
  offset: number;
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
  buyers_total: number;
  buyers: BrandDetailBuyer[];
  catalogs: BrandDetailCatalog[];
  activity: BrandDetailActivity[];
  performance_cards?: unknown[];
  detail_v2?: unknown;
}

function optimisticBrandFromPayload(payload: CreateTenantBrandPayload): TenantBrand {
  const now = new Date().toISOString();
  const masterBrand =
    payload.mode === 'custom'
      ? {
          id: `optimistic-master-${Date.now()}`,
          name: payload.name,
          slug: payload.slug,
          logo_url: payload.logo_url ?? null,
          description: payload.description ?? null,
        }
      : payload.optimistic_master_brand ?? null;

  return {
    id: `optimistic-${Date.now()}`,
    tenant_id: '',
    master_brand_id: payload.mode === 'import' ? payload.master_brand_id : null,
    display_name_override:
      payload.display_name_override ??
      payload.name ??
      (payload.mode === 'custom' ? payload.name : masterBrand?.name ?? null),
    slug: payload.slug ?? masterBrand?.slug ?? null,
    description: payload.description ?? masterBrand?.description ?? null,
    logo_url: payload.logo_url ?? masterBrand?.logo_url ?? null,
    margin_pct: payload.margin_pct ?? null,
    exclusivity: payload.exclusivity ?? false,
    is_active: true,
    external_ref: payload.external_ref ?? null,
    principal_name: payload.principal_name ?? null,
    principal_email: payload.principal_email ?? null,
    principal_phone: payload.principal_phone ?? null,
    principal_location: payload.principal_location ?? null,
    contact_name: payload.contact_name ?? null,
    contact_email: payload.contact_email ?? null,
    contact_phone: payload.contact_phone ?? null,
    default_cohort_id: payload.default_cohort_id ?? null,
    created_at: now,
    updated_at: now,
    master_brand: masterBrand,
  };
}

function prependOptimisticBrand(old: TenantBrandsResponse | undefined, brand: TenantBrand): TenantBrandsResponse {
  return {
    ...(old ?? {}),
    brands: [brand, ...(old?.brands ?? [])],
  };
}

function restoreQuerySnapshots(
  queryClient: QueryClient,
  snapshots?: Array<[readonly unknown[], TenantBrandsResponse | undefined]>,
) {
  snapshots?.forEach(([key, previous]) => {
    queryClient.setQueryData(key, previous);
  });
}

export function useTenantBrands(
  period: SellerLandingPeriod = 'month',
  filters: TenantBrandsLandingFilters = {},
  initialData?: TenantBrandsResponse,
) {
  const hasFilters = Boolean(filters.search?.trim() || filters.categories?.length || filters.cohorts?.length);
  const baseSummary = getSellerLandingInitialData(period, initialData);
  const query = useInfiniteQuery({
    queryKey: ['tenant-brands', period, filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<TenantBrandsResponse> => {
      const params = new URLSearchParams({ period, limit: '50', offset: String(pageParam), include_summary: String(pageParam === 0 && !hasFilters) });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'categories', filters.categories);
      appendArrayParam(params, 'cohorts', filters.cohorts);
      const res = await apiFetch(`/api/tenant/brands?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch brands');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialData: baseSummary
      ? { pages: [baseSummary], pageParams: [0] }
      : undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'brands');
  return { ...query, data: merged && baseSummary ? { ...baseSummary, ...merged } : merged };
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
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useBrandBuyers(id: string, filters: { query?: string; segment?: string; sort?: string; page?: number }, enabled = true) {
  return useQuery<BrandBuyerPage>({
    queryKey: ['tenant-brand-buyers', id, filters],
    enabled: Boolean(id) && enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: '50' });
      params.set('offset', String(Math.max(0, filters.page ?? 0) * 50));
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      if (filters.segment) params.set('segment', filters.segment);
      if (filters.sort) params.set('sort', filters.sort);
      const res = await apiFetch(`/api/tenant/brands/${id}/buyers?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch brand buyers');
      return res.json();
    },
    placeholderData: (previous) => previous,
    staleTime: 30_000,
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
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useAddBrandToTenant() {
  const mutation = useCreateTenantBrand();
  return {
    ...mutation,
    mutateAsync: (payload: AddBrandPayload) => mutation.mutateAsync({ exclusivity: false, ...payload }),
    mutate: (payload: AddBrandPayload) => mutation.mutate({ exclusivity: false, ...payload }),
  };
}

export function useUpdateTenantBrand(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TenantBrandUpdateInput) => {
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
    onMutate: async (payload: TenantBrandUpdateInput) => {
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
                slug: payload.slug === undefined ? brand.slug : payload.slug,
                description:
                  payload.description === undefined ? brand.description : payload.description,
                logo_url: payload.logo_url === undefined ? brand.logo_url : payload.logo_url,
                margin_pct: payload.margin_pct === undefined ? brand.margin_pct : payload.margin_pct,
                exclusivity:
                  payload.exclusivity === undefined ? brand.exclusivity : payload.exclusivity,
                external_ref:
                  payload.external_ref === undefined ? brand.external_ref : payload.external_ref,
                principal_name:
                  payload.principal_name === undefined ? brand.principal_name : payload.principal_name,
                principal_email:
                  payload.principal_email === undefined ? brand.principal_email : payload.principal_email,
                principal_phone:
                  payload.principal_phone === undefined ? brand.principal_phone : payload.principal_phone,
                principal_location:
                  payload.principal_location === undefined ? brand.principal_location : payload.principal_location,
                contact_name:
                  payload.contact_name === undefined ? brand.contact_name : payload.contact_name,
                contact_email:
                  payload.contact_email === undefined ? brand.contact_email : payload.contact_email,
                contact_phone:
                  payload.contact_phone === undefined ? brand.contact_phone : payload.contact_phone,
                default_cohort_id:
                  payload.default_cohort_id === undefined ? brand.default_cohort_id : payload.default_cohort_id,
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

export function useCreateTenantBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTenantBrandPayload): Promise<{ brand: TenantBrand }> => {
      const { optimistic_master_brand: _optimisticMasterBrand, ...requestBody } = data;
      const res = await apiPost('/api/tenant/brands', requestBody);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw { status: res.status, ...(err as object) } as CreateCustomBrandError;
      }

      return res.json() as Promise<{ brand: TenantBrand }>;
    },

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-brands'] });
      const snapshots = queryClient.getQueriesData<TenantBrandsResponse>({ queryKey: ['tenant-brands'] });
      const optimisticBrand = optimisticBrandFromPayload(data);

      snapshots.forEach(([key]) => {
        queryClient.setQueryData<TenantBrandsResponse>(key, (old) => prependOptimisticBrand(old, optimisticBrand));
      });

      return { snapshots };
    },
    onError: (_error, _data, ctx) => restoreQuerySnapshots(queryClient, ctx?.snapshots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-brands'] });
    },
  });
}

export function useCreateCustomBrand() {
  const mutation = useCreateTenantBrand();

  return {
    ...mutation,
    mutateAsync: (data: CreateBrandInput) =>
      mutation.mutateAsync({
        mode: 'custom',
        ...data,
      }),
    mutate: (data: CreateBrandInput) =>
      mutation.mutate({
        mode: 'custom',
        ...data,
      }),
  };
}
