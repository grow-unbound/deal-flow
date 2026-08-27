'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';

const SELECTED_PRODUCTS_LIMIT = 250;

export interface ProductPickerProduct {
  id: string;
  display_name: string;
  internal_sku: string | null;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  mrp: number;
  base_selling_price: number | null;
  cost_price: number | null;
  qty_available: number;
  invoice_value: number;
  invoice_units: number;
  invoice_count: number;
}

export interface ProductPickerFilterOption {
  id: string;
  label: string;
}

export interface ProductPickerResultsetResponse {
  products: ProductPickerProduct[];
  selected_products: ProductPickerProduct[];
  total: number;
  nextCursor: string | null;
  filters: {
    brands: ProductPickerFilterOption[];
    categories: ProductPickerFilterOption[];
  };
}

export interface ProductPickerFilters {
  query?: string;
  selectedIds?: string[];
  limit?: number;
  enabled?: boolean;
  brandIds?: string[];
  categoryIds?: string[];
  stockBucket?: 'in_stock' | 'low_stock' | 'out_of_stock' | null;
  status?: 'active' | 'dormant' | 'inactive' | null;
  quickFilters?: string[];
}

/**
 * Shared product-picker query for the Price List and Campaign Add/Edit forms' product
 * search-overlay pickers. Backed by /api/tenant/products/picker (app.search_picker_products,
 * v4 metrics only) -- separate from usePriceListComposerProducts/useCatalogComposerProducts,
 * which stay on their existing merchandising-grid data path.
 */
export function useProductPickerSearch({
  query,
  selectedIds = [],
  limit = 30,
  enabled = true,
  brandIds = [],
  categoryIds = [],
  stockBucket = null,
  status = null,
  quickFilters = [],
}: ProductPickerFilters) {
  return useInfiniteQuery({
    queryKey: [
      'product-picker',
      query?.trim() ?? '',
      selectedIds,
      limit,
      brandIds,
      categoryIds,
      stockBucket,
      status,
      quickFilters,
    ],
    queryFn: async ({ pageParam, signal }): Promise<ProductPickerResultsetResponse> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (query?.trim()) params.set('q', query.trim());
      if (pageParam) params.set('cursor', pageParam as string);
      appendArrayParam(params, 'brand_id', brandIds);
      appendArrayParam(params, 'category_id', categoryIds);
      appendArrayParam(params, 'quick', quickFilters);
      if (stockBucket) params.set('stock', stockBucket);
      if (status) params.set('status', status);
      // Hard-capped: never send an unbounded id list.
      appendArrayParam(params, 'selected_id', selectedIds.slice(0, SELECTED_PRODUCTS_LIMIT));
      const res = await apiFetch(`/api/tenant/products/picker?${params.toString()}`, { signal });
      if (!res.ok) {
        throw new Error('Failed to fetch product picker results');
      }
      return res.json();
    },
    enabled,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}
