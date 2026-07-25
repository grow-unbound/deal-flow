'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import type { BuyerDeliveryLocation } from '@/lib/buyer-delivery-location';
import type {
  BuyerBrand,
  BuyerCatalogItem,
  BuyerCatalogResponse,
  BuyerCatalogSummary,
  BuyerCategory,
  BuyerResolvedProductsResponse,
} from '@/types/buyer';
import type { BuyerProductPageRecos } from '@/lib/buyer-home-types';
import {
  BUYER_REFERENCE_QUERY_STALE_TIME,
  BUYER_REFERENCE_QUERY_GC_TIME,
  BUYER_PRICE_QUERY_STALE_TIME,
  BUYER_PRICE_QUERY_GC_TIME,
} from '@/lib/query-navigation';

type FilterMode = 'category' | 'brand' | 'list';

const PAGE_SIZE = 40;

const BUYER_CATEGORIES_KEY = ['buyer-categories'] as const;
const BUYER_BRANDS_KEY = ['buyer-brands'] as const;
const BUYER_CATALOGS_KEY = ['buyer-catalogs'] as const;

function buyerDeliveryStockSignature(selected: BuyerDeliveryLocation | null | undefined): string {
  if (!selected) return 'no-delivery';
  return [
    selected.nearest_warehouse_id ?? 'no-warehouse',
    selected.routed_location_id ?? 'no-location',
    selected.place_id,
    selected.lat,
    selected.lng,
  ].join(':');
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(`Request failed: ${url}`);
  return response.json() as Promise<T>;
}

export function useBuyerCategories() {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  return useQuery<BuyerCategory[]>({
    queryKey: [...BUYER_CATEGORIES_KEY, stockSignature],
    queryFn: async () => {
      const body = await fetchJson<{ categories?: BuyerCategory[] }>('/api/buyer/categories');
      return body.categories ?? [];
    },
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
}

export function useBuyerBrands() {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  return useQuery<BuyerBrand[]>({
    queryKey: [...BUYER_BRANDS_KEY, stockSignature],
    queryFn: async () => {
      const body = await fetchJson<{ brands?: BuyerBrand[] }>('/api/buyer/brands');
      return body.brands ?? [];
    },
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
}

export function useBuyerCatalogs() {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  return useQuery<BuyerCatalogSummary[]>({
    queryKey: [...BUYER_CATALOGS_KEY, stockSignature],
    queryFn: async () => {
      const body = await fetchJson<{ catalogs?: BuyerCatalogSummary[] }>('/api/buyer/catalogs');
      return body.catalogs ?? [];
    },
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });
}

export function useBuyerCatalogLandingData() {
  const catalogsQuery = useBuyerCatalogs();
  const categoriesQuery = useBuyerCategories();
  const brandsQuery = useBuyerBrands();

  return {
    data:
      catalogsQuery.data !== undefined &&
      categoriesQuery.data !== undefined &&
      brandsQuery.data !== undefined
        ? {
            catalogs: catalogsQuery.data,
            categories: categoriesQuery.data,
            brands: brandsQuery.data,
          }
        : undefined,
    isLoading: catalogsQuery.isLoading || categoriesQuery.isLoading || brandsQuery.isLoading,
    isError: catalogsQuery.isError || categoriesQuery.isError || brandsQuery.isError,
    refetch: async () => {
      await Promise.all([
        catalogsQuery.refetch(),
        categoriesQuery.refetch(),
        brandsQuery.refetch(),
      ]);
    },
  };
}

export interface BuyerCatalogSearchFilters {
  categoryId?: string;
  brandId?: string;
  campaignId?: string;
}

export function useBuyerCatalogSearchInfinite(
  search: string,
  filters: BuyerCatalogSearchFilters = {},
  enabled = true,
) {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  const trimmedSearch = search.trim();
  const categoryId = filters.categoryId?.trim() ?? '';
  const brandId = filters.brandId?.trim() ?? '';
  const campaignId = filters.campaignId?.trim() ?? '';

  return useInfiniteQuery<BuyerCatalogResponse>({
    queryKey: [
      'buyer-catalog-search',
      trimmedSearch,
      categoryId,
      brandId,
      campaignId,
      stockSignature,
    ],
    enabled: enabled && trimmedSearch.length > 0,
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (trimmedSearch) params.set('search', trimmedSearch);
      if (categoryId) params.set('category_id', categoryId);
      if (brandId) params.set('brand_id', brandId);
      if (campaignId) params.set('campaign_id', campaignId);
      return fetchJson<BuyerCatalogResponse>(`/api/buyer/catalog?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.has_more) return undefined;
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded;
    },
    placeholderData: keepPreviousData,
    staleTime: BUYER_PRICE_QUERY_STALE_TIME,
    gcTime: BUYER_PRICE_QUERY_GC_TIME,
  });
}

export function useBuyerCatalogList(mode: FilterMode, id: string, search = '') {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  const trimmedSearch = search.trim();
  return useInfiniteQuery<BuyerCatalogResponse>({
    queryKey: ['buyer-catalog-list', mode, id, trimmedSearch, stockSignature],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (mode === 'category') params.set('category_id', id);
      if (mode === 'brand') params.set('brand_id', id);
      if (mode === 'list') params.set('campaign_id', id);
      if (trimmedSearch) params.set('search', trimmedSearch);
      return fetchJson<BuyerCatalogResponse>(`/api/buyer/catalog?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.has_more) return undefined;
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded;
    },
    placeholderData: keepPreviousData,
    staleTime: BUYER_PRICE_QUERY_STALE_TIME,
    gcTime: BUYER_PRICE_QUERY_GC_TIME,
  });
}

export function useBuyerProductRecommendations(tenantProductId: string) {
  return useQuery<BuyerProductPageRecos>({
    queryKey: ['buyer-product-recommendations', tenantProductId],
    queryFn: async () =>
      fetchJson<BuyerProductPageRecos>(`/api/buyer/recommendations?product_id=${encodeURIComponent(tenantProductId)}`),
    staleTime: BUYER_PRICE_QUERY_STALE_TIME,
    gcTime: BUYER_PRICE_QUERY_GC_TIME,
  });
}

export function useBuyerProductDetail(tenantProductId: string) {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  const productQuery = useQuery<{ items?: BuyerCatalogItem[] }>({
    queryKey: ['buyer-product-detail', tenantProductId, stockSignature],
    queryFn: async () =>
      fetchJson<{ items?: BuyerCatalogItem[] }>(`/api/buyer/catalog?tenant_product_id=${encodeURIComponent(tenantProductId)}&limit=1&offset=0`),
    staleTime: BUYER_PRICE_QUERY_STALE_TIME,
    gcTime: BUYER_PRICE_QUERY_GC_TIME,
  });

  const item = productQuery.data?.items?.[0] ?? null;

  const recommendationsQuery = useBuyerProductRecommendations(tenantProductId);

  return {
    item,
    recos: recommendationsQuery.data ?? { co_order: [], co_buyer: [], same_category: [] },
    isLoading: productQuery.isLoading,
    isError: productQuery.isError || (!productQuery.isLoading && !item),
  };
}

export function useBuyerReorderData() {
  return useQuery({
    queryKey: ['buyer-reorder'],
    queryFn: async () => fetchJson('/api/buyer/reorder'),
  });
}

export function useBuyerResolvedProducts(
  items: Array<{ tenant_product_id: string; qty: number }>,
) {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  return useQuery<BuyerResolvedProductsResponse>({
    queryKey: [
      'buyer-resolved-products',
      items.map((item) => `${item.tenant_product_id}:${item.qty}`).join('|'),
      stockSignature,
    ],
    enabled: items.length > 0,
    queryFn: async () => {
      const response = await apiPost('/api/buyer/products/resolve', { items });
      if (!response.ok) throw new Error('Failed to resolve buyer products');
      return response.json() as Promise<BuyerResolvedProductsResponse>;
    },
    // Cart/checkout price resolution — shortest tier, refetch on every remount.
    staleTime: 0,
    gcTime: BUYER_PRICE_QUERY_GC_TIME,
  });
}
