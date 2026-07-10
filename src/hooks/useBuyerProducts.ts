'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  });
}

export function useBuyerProductRecommendations(tenantProductId: string) {
  return useQuery<BuyerProductPageRecos>({
    queryKey: ['buyer-product-recommendations', tenantProductId],
    queryFn: async () =>
      fetchJson<BuyerProductPageRecos>(`/api/buyer/recommendations?product_id=${encodeURIComponent(tenantProductId)}`),
  });
}

export function useBuyerProductDetail(tenantProductId: string) {
  const delivery = useBuyerDeliveryOptional();
  const stockSignature = buyerDeliveryStockSignature(delivery?.selected);
  const productQuery = useQuery<{ items?: BuyerCatalogItem[] }>({
    queryKey: ['buyer-product-detail', tenantProductId, stockSignature],
    queryFn: async () =>
      fetchJson<{ items?: BuyerCatalogItem[] }>(`/api/buyer/catalog?tenant_product_id=${encodeURIComponent(tenantProductId)}&limit=1&offset=0`),
  });

  const item = productQuery.data?.items?.[0] ?? null;

  const brandItemsQuery = useQuery<{ items?: BuyerCatalogItem[] }>({
    queryKey: ['buyer-product-brand-items', tenantProductId, item?.brand_id, stockSignature],
    enabled: Boolean(item?.brand_id),
    queryFn: async () =>
      fetchJson<{ items?: BuyerCatalogItem[] }>(
        `/api/buyer/catalog?brand_id=${encodeURIComponent(item?.brand_id ?? '')}&limit=8&offset=0`,
      ),
  });

  const recommendationsQuery = useBuyerProductRecommendations(tenantProductId);

  return {
    item,
    brandItems: (brandItemsQuery.data?.items ?? [])
      .filter((candidate) => candidate.tenant_product_id !== tenantProductId)
      .slice(0, 6),
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
  });
}
