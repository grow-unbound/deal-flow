import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import type { SellerLandingPeriod } from '@/lib/seller-period';

// ─── Landing types ────────────────────────────────────────────────────────────

export interface CategoryLandingKpis {
  active_count: number;
  low_stock_count: number;
  top_category_name: string | null;
  top_category_share_pct: number;
  uncategorized_count: number;
}

export interface CategoryTableRow {
  id: string;
  name: string;
  slug: string;
  initials: string;
  is_active: boolean;
  active_sku_count: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
  brand_count: number;
  gmv_mtd: number;
  gmv_prev: number;
  growth_pct: number;
  units_mtd: number;
  buyers_count: number;
  avg_days_cover: number | null;
}

export interface CategoryCalloutRow {
  id: string;
  name: string;
  initials: string;
  oos_sku_count?: number;
  low_stock_sku_count?: number;
  gmv_mtd?: number;
  growth_pct?: number;
  buyers_count?: number;
  units_mtd?: number;
}

export interface CategoriesLandingResponse {
  kpis: CategoryLandingKpis;
  callouts: {
    stockout_risk: CategoryCalloutRow[];
    top_performers: CategoryCalloutRow[];
    fast_movers: CategoryCalloutRow[];
  };
  rows: CategoryTableRow[];
  period: string;
}

export interface CategoriesLandingFilters {
  search?: string;
  status?: string[];
  products?: string[];
}

export function useCategoryLanding(
  period: SellerLandingPeriod,
  filters: CategoriesLandingFilters = {},
  initialData?: CategoriesLandingResponse | null,
) {
  const { session } = useAuth();
  const { data, isLoading, isError } = useQuery<CategoriesLandingResponse>({
    queryKey: ['categories-landing', period, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'products', filters.products);
      const res = await apiFetch(`/api/tenant/categories/landing?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch categories landing');
      return res.json();
    },
    enabled: !!session,
    initialData: initialData ?? undefined,
    staleTime: 60_000,
  });

  const retained = useRetainedValue(data);
  return { data: data ?? retained, isLoading, isError };
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
  active_sku_count: number;
  brand_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryDetailMetaStrip {
  gmv_mtd: number;
  growth_pct: number;
  active_sku_count: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
  active_buyer_count: number;
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
  sku_count: number;
  gmv_mtd: number;
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
  overview: CategoryDetailOverview;
  products: CategoryDetailProduct[];
  brands: CategoryDetailBrand[];
  activity: CategoryDetailActivity[];
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
    staleTime: 30_000,
  });
}
