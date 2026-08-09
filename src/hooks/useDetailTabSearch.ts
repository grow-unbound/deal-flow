'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';

interface DetailPage<T> { rows: T[]; total: number; nextOffset: number | null }
type DetailParamValue = string | string[] | null | undefined;
interface DetailFilters { query: string; filter?: string | null; sort: string; params?: Record<string, DetailParamValue> }

function useDetailRows<T>(key: string, url: string, filterKey: string, filters: DetailFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: [key, url, filters.query.trim(), filters.filter ?? null, filters.sort, filters.params ?? {}],
    initialPageParam: 0,
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam, signal }): Promise<DetailPage<T>> => {
      const params = new URLSearchParams({ limit: '50', offset: String(pageParam), sort: filters.sort });
      if (filters.query.trim()) params.set('q', filters.query.trim());
      if (filters.filter) params.set(filterKey, filters.filter);
      Object.entries(filters.params ?? {}).forEach(([paramKey, value]) => {
        if (Array.isArray(value)) {
          value.filter(Boolean).forEach((item) => params.append(paramKey, item));
          return;
        }
        if (value) params.set(paramKey, value);
      });
      const response = await apiFetch(`${url}?${params.toString()}`, { signal });
      if (!response.ok) throw new Error('Failed to load detail rows');
      return response.json() as Promise<DetailPage<T>>;
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export interface BrandProductDetailRow {
  tenant_product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  on_hand: number;
  days_cover: number;
  units_qtd: number;
  sales_qtd: number;
  units_qtd_trend_pct: number | null;
  sales_qtd_trend_pct: number | null;
  image_url: string | null;
  low_stock: boolean;
  out_of_stock: boolean;
  is_idle?: boolean;
}

export function useBrandProductsDetail(id: string, filters: DetailFilters, enabled = true) {
  return useDetailRows<BrandProductDetailRow>('brand-products-detail', `/api/tenant/brands/${id}/products`, 'stock', filters, enabled);
}

export interface CategoryProductDetailRow {
  id: string;
  name: string;
  sku_code: string | null;
  brand_id: string;
  brand_name: string;
  brand_logo_url: string | null;
  image_url: string | null;
  on_hand: number;
  days_cover: number | null;
  units_qtd: number;
  sales_qtd: number;
  units_qtd_trend_pct: number | null;
  sales_qtd_trend_pct: number | null;
  is_active: boolean;
  is_idle?: boolean;
  low_stock?: boolean;
  out_of_stock?: boolean;
}

export interface CategoryBrandDetailRow {
  id: string;
  name: string;
  initials: string;
  logo_url: string | null;
  sku_count: number;
  sales_qtd: number;
  units_qtd: number;
  sales_qtd_trend_pct: number | null;
  units_qtd_trend_pct: number | null;
  demand_qtd_value: number;
  demand_qtd_units: number;
  is_active: boolean;
}

export function useCategoryProductsDetail(categoryId: string, filters: DetailFilters, enabled = true) {
  return useDetailRows<CategoryProductDetailRow>(
    'category-products-detail',
    `/api/tenant/categories/${categoryId}/products`,
    'stock',
    filters,
    enabled,
  );
}

export function useCategoryBrandsDetail(categoryId: string, filters: DetailFilters, enabled = true) {
  return useDetailRows<CategoryBrandDetailRow>(
    'category-brands-detail',
    `/api/tenant/categories/${categoryId}/brands`,
    'status',
    filters,
    enabled,
  );
}

export interface BrandCatalogDetailRow {
  campaign_id: string; campaign_name: string; cohort_name: string; status: string;
  sent_at: string; gmv: number; orders: number;
}

export function useBrandCatalogsDetail(id: string, filters: DetailFilters) {
  return useDetailRows<BrandCatalogDetailRow>('brand-catalogs-detail', `/api/tenant/brands/${id}/catalogs`, 'status', filters);
}

export interface CatalogProductDetailRow {
  item_id: string | null; tenant_product_id: string; product_name: string; sku: string; brand_name: string; category_name: string;
  mrp: number | null; base_selling_price: number | null; override_price: number | null;
  catalog_order: number; on_hand: number; days_cover: number; catalog_units_sold: number;
  catalog_gmv: number; item_tag: 'new' | 'new_stock' | 'old_stock' | 'none'; is_member: boolean;
  image_url: string | null; stock_status: 'new_stock' | 'in_stock' | 'low_stock' | 'out_of_stock';
  cost_price: number | null; discount_pct: number | null; margin_pct: number | null;
}

export function useCatalogProductsDetail(id: string, filters: DetailFilters) {
  return useDetailRows<CatalogProductDetailRow>('catalog-products-detail', `/api/tenant/catalogs/${id}/products`, 'stock', filters);
}

export interface CohortBuyerDetailRow {
  buyer_id: string; business_name: string; contact_name: string | null; external_ref: string | null;
  geography_label: string; tier: 'A' | 'B' | 'C' | null; spend_90d: number; invoice_count_90d: number;
  demand_value_90d: number; demand_count_90d: number; outstanding_due: number; last_invoice_at: string | null; last_primary_demand_at: string | null;
  is_member: boolean; buyer_app_status: 'enabled' | 'not_enabled' | 'inactive'; primary_demand_kind: 'orders' | 'estimates' | 'none';
  mtd_spend: number; orders_mtd: number; aov: number; credit_used: number; last_order_at: string | null;
}

export function useCohortBuyersDetail(id: string, filters: DetailFilters) {
  return useDetailRows<CohortBuyerDetailRow>('cohort-buyers-detail', `/api/cohorts/${id}/buyers`, 'activity', filters);
}

export interface PriceListProductDetailRow {
  item_id: string | null; tenant_product_id: string; product_name: string; sku: string; brand_name: string; category_name: string;
  mrp: number | null; base_price: number; list_price: number | null; cost_price: number | null;
  discount_pct: number | null; margin_pct: number | null; is_member: boolean; image_url: string | null;
  stock_status: 'new_stock' | 'in_stock' | 'low_stock' | 'out_of_stock'; on_hand: number;
}

export function usePriceListProductsDetail(id: string, filters: DetailFilters) {
  return useDetailRows<PriceListProductDetailRow>('price-list-products-detail', `/api/price-lists/${id}/products`, 'position', filters);
}

export function flattenDetailRows<T>(data: { pages: Array<DetailPage<T>> } | undefined): T[] {
  return data?.pages.flatMap((page) => page.rows) ?? [];
}

export function detailRowsTotal<T>(data: { pages: Array<DetailPage<T>> } | undefined): number {
  return data?.pages[0]?.total ?? 0;
}
