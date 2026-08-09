import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import type { SellerLandingPeriod, SellerLandingPeriodMeta } from '@/lib/seller-period';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';
import { REFERENCE_QUERY_STALE_TIME, REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';

// ─── Landing types ────────────────────────────────────────────────────────────

export interface CategoryTableRow {
  id: string;
  name: string;
  slug: string;
  initials: string;
  image_url: string | null;
  is_active: boolean;
  active_sku_count: number;
  total_sku_count?: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
  stock_on_hand?: number;
  brand_count: number;
  gmv_mtd: number;
  units_mtd?: number;
  invoice_value?: number;
  invoice_count?: number;
  invoice_product_count?: number;
  invoice_buyer_count?: number;
  buyers_count: number;
  avg_days_cover?: number | null;
}

export interface CategoriesLandingResponse {
  rows: CategoryTableRow[];
  total: number;
  limit?: number;
  nextCursor?: string | null;
  period?: SellerLandingPeriodMeta | string;
  period_key?: string;
  grain?: 'quarter';
  filters?: {
    groups: Array<{
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
    }>;
  };
  sort?: CategoryLandingSort;
}

export interface CategoriesLandingFilters {
  search?: string;
  status?: string[];
  products?: string[];
  stock?: string[];
  sort?: CategoryLandingSort;
  filter_preset?: Record<string, unknown> | null;
}

export type CategoryLandingSort = 'invoice_value_desc' | 'name_asc' | 'oos_sku_count_desc' | 'invoice_count_desc' | 'invoice_buyer_count_desc';

export interface CategoriesLandingKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface CategoriesLandingMetricsV4 {
  page_key: string;
  period: {
    period_key: string;
    grain: string;
    period_start: string;
    period_end_exclusive: string;
    label?: string;
  };
  computed_at: string | null;
  source_watermark: string | null;
  cards: CategoriesLandingKpiCardV4[];
}

export function useCategoriesLandingMetrics(initialData?: CategoriesLandingMetricsV4 | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['categories-landing-metrics-v4'],
    queryFn: async (): Promise<CategoriesLandingMetricsV4> => {
      const res = await apiFetch('/api/tenant/categories/metrics');
      if (!res.ok) throw new Error('Failed to fetch categories metrics');
      return res.json() as Promise<CategoriesLandingMetricsV4>;
    },
    enabled: !!session,
    initialData: initialData ?? undefined,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
}

export function useCategoryLanding(
  period: SellerLandingPeriod,
  filters: CategoriesLandingFilters = {},
  initialData?: CategoriesLandingResponse | null,
) {
  const { session } = useAuth();
  const query = useInfiniteQuery<CategoriesLandingResponse>({
    queryKey: ['categories-landing', period, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ period, limit: '50' });
      if (pageParam) params.set('cursor', String(pageParam));
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'products', filters.products);
      appendArrayParam(params, 'stock', filters.stock);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.filter_preset) params.set('filter_preset', JSON.stringify(filters.filter_preset));
      const res = await apiFetch(`/api/tenant/categories/landing?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch categories landing');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!session,
    initialData: initialData ? { pages: [initialData], pageParams: [undefined] } : undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    placeholderData: keepPreviousData,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'rows');
  return { ...query, data: merged };
}

// ─── Detail types ─────────────────────────────────────────────────────────────

export interface CategoryDetailHeader {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  initials: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  external_ref: string | null;
  r2_image_thumb_key: string | null;
  r2_image_original_key: string | null;
  r2_image_medium_key: string | null;
  deleted_at: string | null;
  image_url: string | null;
  active_sku_count: number;
  brand_count: number;
  created_at: string;
  updated_at: string;
}

/** Quarter-to-date KPI strip, sourced from metrics_category_period_summary + metrics_category_now_summary. */
export interface CategoryDetailMetaStrip {
  sales_qtd_value: number;
  sales_qtd_count: number;
  selling_product_count_qtd: number;
  total_product_count: number;
  purchasing_customers_qtd: number;
  brand_count: number;
  /** Products with invoiced sales > 0 in the last 90 days (from product-action-list, capped at 20 items). */
  sold_sku_count: number;
  active_sku_count: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
}

export interface CategoryDetailOverview {
  trend_weekly: Array<{ week_label: string; gmv: number; units: number }>;
  stock_health: {
    active_sku_count: number;
    oos_sku_count: number;
    low_stock_sku_count: number;
    uncovered_sku_count: number;
  };
  top_brands: Array<{ id: string; name: string; initials: string; units_mtd: number; gmv_mtd: number }>;
}

export interface CategoryDetailProduct {
  id: string;
  name: string;
  sku_code: string | null;
  brand_id: string;
  brand_name: string;
  brand_logo_url: string | null;
  image_url: string | null;
  on_hand: number;
  days_cover: number | null;
  units_mtd: number;
  gmv_mtd: number;
  is_active: boolean;
}

export interface CategoryDetailBrand {
  id: string;
  name: string;
  initials: string;
  logo_url: string | null;
  sku_count: number;
  gmv_mtd: number;
  units_90d: number;
  demand_90d: number;
  demand_units_90d: number;
  growth_pct: number;
  is_active: boolean;
}

export interface CategoryDetailActivity {
  id: string;
  action: string;
  actor_name: string;
  ts: string;
  diff: unknown;
}

export interface CategoryDetailResponse {
  header: CategoryDetailHeader;
  meta_strip_4: CategoryDetailMetaStrip;
}

export function useCategoryDetail(id: string) {
  const { session } = useAuth();
  return useQuery<CategoryDetailResponse>({
    queryKey: ['category-detail', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/categories/${id}`);
      if (!res.ok) throw new Error('Failed to fetch category detail');
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.data;
    },
    enabled: !!session && !!id,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
}
