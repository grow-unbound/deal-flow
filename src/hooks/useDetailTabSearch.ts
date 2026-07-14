'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

interface DetailPage<T> { rows: T[]; total: number; nextOffset: number | null }
interface DetailFilters { query: string; filter?: string | null; sort: string }

function useDetailRows<T>(key: string, url: string, filterKey: string, filters: DetailFilters) {
  return useInfiniteQuery({
    queryKey: [key, url, filters.query.trim(), filters.filter ?? null, filters.sort],
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam, signal }): Promise<DetailPage<T>> => {
      const params = new URLSearchParams({ limit: '50', offset: String(pageParam), sort: filters.sort });
      if (filters.query.trim()) params.set('q', filters.query.trim());
      if (filters.filter) params.set(filterKey, filters.filter);
      const response = await apiFetch(`${url}?${params.toString()}`, { signal });
      if (!response.ok) throw new Error('Failed to load detail rows');
      return response.json() as Promise<DetailPage<T>>;
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
}

export interface BrandProductDetailRow {
  tenant_product_id: string; product_name: string; sku: string; category_name: string;
  mrp: number | null; base_selling_price: number | null; cost_price: number | null;
  on_hand: number; days_cover: number; units_mtd: number; gmv_mtd: number; growth_pct: number;
}

export function useBrandProductsDetail(id: string, filters: DetailFilters) {
  return useDetailRows<BrandProductDetailRow>('brand-products-detail', `/api/tenant/brands/${id}/products`, 'stock', filters);
}

export interface BrandCatalogDetailRow {
  campaign_id: string; campaign_name: string; cohort_name: string; status: string;
  sent_at: string; gmv: number; orders: number;
}

export function useBrandCatalogsDetail(id: string, filters: DetailFilters) {
  return useDetailRows<BrandCatalogDetailRow>('brand-catalogs-detail', `/api/tenant/brands/${id}/catalogs`, 'status', filters);
}

export interface CatalogProductDetailRow {
  tenant_product_id: string; product_name: string; sku: string; brand_name: string;
  mrp: number | null; base_selling_price: number | null; override_price: number | null;
  catalog_order: number; on_hand: number; days_cover: number; catalog_units_sold: number;
  catalog_gmv: number; item_tag: 'new' | 'new_stock' | 'old_stock' | 'none';
}

export function useCatalogProductsDetail(id: string, filters: DetailFilters) {
  return useDetailRows<CatalogProductDetailRow>('catalog-products-detail', `/api/tenant/catalogs/${id}/products`, 'stock', filters);
}

export interface CohortBuyerDetailRow {
  buyer_id: string; business_name: string; contact_name: string | null; external_ref: string | null;
  geography_label: string; tier: 'A' | 'B' | 'C' | null; mtd_spend: number; orders_mtd: number;
  aov: number; credit_used: number; last_order_at: string | null;
}

export function useCohortBuyersDetail(id: string, filters: DetailFilters) {
  return useDetailRows<CohortBuyerDetailRow>('cohort-buyers-detail', `/api/cohorts/${id}/buyers`, 'activity', filters);
}

export interface PriceListProductDetailRow {
  item_id: string; tenant_product_id: string; product_name: string; sku: string; brand_name: string;
  mrp: number | null; base_price: number; list_price: number; cost_price: number | null;
  discount_pct: number | null; margin_pct: number | null;
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
