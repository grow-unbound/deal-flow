'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CustomProductInput } from '@/lib/zod';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME, REFERENCE_QUERY_STALE_TIME, REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import type { LandingFilterMeta } from '@/lib/landing-filter-params';

export interface MasterProduct {
  id: string;
  name: string;
  master_sku: string;
  brand_id: string;
  brand_name: string | null;
  brand_logo_url: string | null;
  gst_rate: number | null;
  hsn_code: string | null;
  default_uom: string | null;
  pack_size: number | null;
  description: string | null;
  image_urls: string[] | null;
  category_name?: string | null;
}

export interface TenantProduct {
  id: string;
  tenant_id: string;
  tenant_brand_id: string | null;
  master_product_id: string | null;
  internal_sku: string;
  name_override: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  default_uom: string | null;
  pack_size: number | null;
  hsn_code?: string | null;
  gst_rate?: number | null;
  description?: string | null;
  attributes_override?: Record<string, string> | null;
  image_urls: string[] | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  master_product: MasterProduct | null;
  display_name: string;
  brand_name: string | null;
  category_name?: string | null;
  tenant_category_id?: string | null;
  on_hand?: number;
  days_cover?: number | null;
  units_mtd?: number;
  gmv_mtd?: number;
  invoice_units?: number;
  invoice_value?: number;
  invoice_count?: number;
  invoice_buyer_count?: number;
  estimate_units?: number;
  estimate_value?: number;
  estimate_count?: number;
  order_units?: number;
  order_value?: number;
  order_count?: number;
  status_label?: string;
  status_tone?: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface ProductsKpis {
  active_skus: number;
  total_skus: number;
  archived_skus: number;
  out_of_stock: number;
  low_stock: number;
  recently_sold_out_of_stock: number;
  products_sold: number;
  brand_count: number;
  category_count: number;
  units_mtd?: number;
  revenue_mtd: number;
}

export interface ProductsTodaysReadItem {
  id: string;
  name: string;
  sku: string;
  brand: string;
  brand_initials: string;
  brand_hue: 'teal' | 'ember' | 'cream';
  on_hand: number;
  days_cover: number | null;
  units_mtd: number;
  gmv_mtd: number;
  status: {
    label: string;
    tone: 'success' | 'warning' | 'danger' | 'neutral';
  };
}

export interface ProductDetailResponse {
  product: TenantProduct;
  detail: {
    header: {
      id: string;
      name: string;
      brand: string;
      sku: string;
      pack: string;
      mrp: number;
      status_label: string;
      status_tone: 'success' | 'warning' | 'danger' | 'neutral';
    };
    meta_strip_4: {
      units_mtd: number;
      days_cover: number;
      on_hand: number;
      sell_through_pct: number;
    };
    details: {
      id: string;
      name_override: string | null;
      name: string;
      sku: string;
      category: string;
      pack_size: number | null;
      default_uom: string | null;
      mrp: number | null;
      base_selling_price: number | null;
      cost_price: number | null;
      external_ref: string | null;
      is_active: boolean;
      hsn_code: string | null;
      gst_rate: number | null;
      description?: string | null;
      updated_at: string;
    };
    performance: {
      monthly_units_trend: Array<{
        month: string;
        units: number;
        revenue: number;
      }>;
      inventory_ops: {
        on_hand: number;
        days_cover: number;
        sell_through_pct: number;
        last_ordered_at: string | null;
        last_ordered_buyer: string | null;
      };
      top_buyers: Array<{
        buyer_id: string;
        buyer_name: string;
        city: string | null;
        units: number;
      }>;
      price_by_cohort: Array<{
        cohort: string;
        price: number;
        has_override: boolean;
      }>;
      units_snapshot: {
        units_mtd: number;
        revenue_last_30d: number;
      };
    };
    pricing_summary: {
      mrp: number | null;
      base_selling_price: number | null;
      cost_price: number | null;
      margin_pct: number | null;
    };
    performance_cards?: unknown[];
    detail_v2?: unknown;
    pricing: Array<{
      item_id: string | null;
      price_list_id: string;
      price_list_name: string;
      list_price: number | null;
      effective_price: number | null;
      valid_from: string | null;
      valid_to: string | null;
      created_at: string;
      is_active: boolean;
      is_managed_externally: boolean;
      status: 'active' | 'draft' | 'expired';
      avg_discount_pct: number | null;
      avg_margin_pct: number | null;
    }>;
    activity: Array<{
      id: string;
      at: string;
      action: string;
      entity_type: string;
      entity_id: string;
      summary: string;
      diff: Record<string, unknown> | null;
    }>;
    role: string;
  };
}

export interface TenantProductsResponse {
  period?: SellerLandingPeriodMeta;
  period_key?: string;
  grain?: 'quarter';
  products: TenantProduct[];
  brands?: string[];
  filters?: LandingFilterMeta;
  kpis?: ProductsKpis;
  todays_read?: {
    recently_sold_out_of_stock: ProductsTodaysReadItem[];
    running_low: ProductsTodaysReadItem[];
    no_sale_90d: ProductsTodaysReadItem[];
  };
}

export interface ProductsLandingKpiCardV4 {
  id: string;
  label: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  supporting_text?: string;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface ProductsLandingMetricsV4 {
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
  cards: ProductsLandingKpiCardV4[];
}

export interface SearchProductsResponse {
  products: MasterProduct[];
}

export interface ProductSkuAvailabilityResponse {
  available: boolean;
  duplicate: boolean;
  product: Pick<TenantProduct, 'id' | 'internal_sku' | 'name_override' | 'master_product_id'> | null;
}

export interface AddProductPayload {
  master_product_id: string;
  internal_sku: string;
  mrp: number;
  base_selling_price: number;
  cost_price?: number;
  tenant_brand_id?: string;
  name_override?: string;
  default_uom?: string;
  pack_size?: number;
}

export function useTenantProducts(period: SellerLandingPeriod = 'month', initialData?: TenantProductsResponse | null) {
  return useQuery({
    queryKey: ['tenant-products', period],
    queryFn: async (): Promise<TenantProductsResponse> => {
      const res = await apiFetch(`/api/tenant/products?period=${period}`);
      if (!res.ok) {
        throw new Error('Failed to fetch products');
      }
      return res.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export interface ProductsInfiniteFilters {
  search?: string;
  brand?: string[];
  category?: string[];
  status?: string[];
  stock?: string[];
  sort?: ProductLandingSort;
  filter_preset?: Record<string, unknown> | null;
}

export interface TenantProductsPage extends TenantProductsResponse {
  nextCursor: string | null;
  total: number | null;
  sort?: ProductLandingSort;
}

export type ProductLandingSort =
  | 'invoice_value_desc'
  | 'invoice_value_asc'
  | 'invoice_units_desc'
  | 'order_value_desc'
  | 'estimate_value_desc'
  | 'stock_on_hand_asc';

export function useTenantProductsLandingMetrics(initialData?: ProductsLandingMetricsV4 | null) {
  return useQuery({
    queryKey: ['tenant-products-landing-metrics-v4'],
    queryFn: async (): Promise<ProductsLandingMetricsV4> => {
      const res = await apiFetch('/api/tenant/products/metrics');
      if (!res.ok) {
        throw new Error('Failed to fetch products metrics');
      }
      return res.json() as Promise<ProductsLandingMetricsV4>;
    },
    initialData: initialData ?? undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useTenantProductsInfinite(
  period: SellerLandingPeriod = 'month',
  filters: ProductsInfiniteFilters = {},
) {
  return useInfiniteQuery({
    queryKey: ['tenant-products-infinite', period, filters],
    queryFn: async ({ pageParam }): Promise<TenantProductsPage> => {
      const params = new URLSearchParams({ period });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'brand', filters.brand);
      appendArrayParam(params, 'category', filters.category);
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'stock', filters.stock);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.filter_preset) params.set('filter_preset', JSON.stringify(filters.filter_preset));
      const res = await apiFetch(`/api/tenant/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json() as Promise<TenantProductsPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSearchMasterProducts(query: string) {
  return useQuery({
    queryKey: ['master-products-search', query],
    queryFn: async (): Promise<SearchProductsResponse> => {
      const params = new URLSearchParams({ q: query });
      const res = await apiFetch(`/api/products/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to search products');
      }
      return res.json();
    },
    enabled: query.length >= 1,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useTenantProductSkuAvailability(internalSku: string, excludeId?: string | null) {
  const normalizedSku = internalSku.trim();

  return useQuery({
    queryKey: ['tenant-product-sku-availability', normalizedSku, excludeId ?? null],
    queryFn: async (): Promise<ProductSkuAvailabilityResponse> => {
      const params = new URLSearchParams({ internal_sku: normalizedSku });
      if (excludeId) params.set('exclude_id', excludeId);
      const res = await apiFetch(`/api/tenant/products/sku?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to check SKU availability');
      }
      return res.json() as Promise<ProductSkuAvailabilityResponse>;
    },
    enabled: normalizedSku.length > 0,
    staleTime: 0,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useAddProductToTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AddProductPayload): Promise<TenantProduct> => {
      const res = await apiPost('/api/tenant/products', payload);

      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? 'This SKU already exists in your product list.'
        );
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to add product');
      }
      const data = await res.json() as { product: TenantProduct };
      return data.product;
    },

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-products'] });
      const prev = queryClient.getQueryData<TenantProductsResponse>(['tenant-products']);

      // Optimistic product: placeholder until server responds
      const optimisticProduct: TenantProduct = {
        id: `optimistic-${Date.now()}`,
        tenant_id: '',
        tenant_brand_id: payload.tenant_brand_id ?? null,
        master_product_id: payload.master_product_id,
        internal_sku: payload.internal_sku,
        name_override: payload.name_override ?? null,
        mrp: payload.mrp,
        base_selling_price: payload.base_selling_price,
        cost_price: payload.cost_price ?? null,
        default_uom: payload.default_uom ?? null,
        pack_size: payload.pack_size ?? null,
        image_urls: null,
        is_active: true,
        external_ref: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        master_product: null,
        display_name: payload.name_override ?? payload.internal_sku,
        brand_name: null,
      };

      queryClient.setQueryData<TenantProductsResponse>(['tenant-products'], (old) => ({
        products: [optimisticProduct, ...(old?.products ?? [])],
      }));

      return { prev };
    },

    onError: (_err, _payload, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['tenant-products'], context.prev);
      }
      toast.error(_err instanceof Error ? _err.message : 'Could not add product');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
    },
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['tenant-product', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/products/${id}`);
      if (!res.ok) throw new Error('Product not found');
      return res.json() as Promise<{ product: TenantProduct }>;
    },
    enabled: !!id,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useProductDetail(id: string, options?: { includePerformance?: boolean }) {
  return useQuery({
    queryKey: ['tenant-product-detail', id, options?.includePerformance ?? true],
    queryFn: async (): Promise<ProductDetailResponse> => {
      const params = new URLSearchParams();
      params.set('include_performance', String(options?.includePerformance ?? true));
      const res = await apiFetch(`/api/tenant/products/${id}?${params.toString()}`);
      if (!res.ok) throw new Error('Product not found');
      return res.json() as Promise<ProductDetailResponse>;
    },
    enabled: !!id,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<TenantProduct> & {
        archive?: boolean;
        name?: string | null;
        category_name?: string | null;
        tenant_category_id?: string | null;
      };
    }): Promise<{ product: TenantProduct }> => {
      const res = await apiFetch(`/api/tenant/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw { status: res.status, ...(err as object) };
      }
      return res.json() as Promise<{ product: TenantProduct }>;
    },
    onMutate: async ({ id, data }) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-products'], ['tenant-product', id]]);
      const { archive: _archive, ...safeData } = data;
      void _archive;
      queryClient.setQueryData<TenantProductsResponse>(['tenant-products'], (old) => ({
        products: (old?.products ?? []).map((product) =>
          product.id === id ? { ...product, ...safeData, updated_at: new Date().toISOString() } : product,
        ),
      }));
      queryClient.setQueryData<{ product: TenantProduct }>(['tenant-product', id], (old) =>
        old?.product ? { product: { ...old.product, ...safeData, updated_at: new Date().toISOString() } } : old,
      );
      return { snapshots };
    },
    onError: (error, _vars, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      const msg =
        error &&
        typeof error === 'object' &&
        'error' in error &&
        typeof (error as { error?: unknown }).error === 'string'
          ? (error as { error: string }).error
          : error instanceof Error
            ? error.message
            : 'Could not update product';
      toast.error(msg);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-product', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-product-detail', id] });
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/tenant/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) throw new Error('Failed to deactivate product');
      return res.json();
    },
    onMutate: async (id) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-products'], ['tenant-product', id]]);
      queryClient.setQueryData<TenantProductsResponse>(['tenant-products'], (old) => ({
        products: (old?.products ?? []).map((product) =>
          product.id === id ? { ...product, is_active: false, updated_at: new Date().toISOString() } : product,
        ),
      }));
      queryClient.setQueryData<{ product: TenantProduct }>(['tenant-product', id], (old) =>
        old?.product
          ? { product: { ...old.product, is_active: false, updated_at: new Date().toISOString() } }
          : old,
      );
      return { snapshots };
    },
    onError: (_error, _id, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not deactivate product');
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-product', id] });
    },
  });
}

export function useProductPriceListItemMutations(productId: string, includePerformance = false) {
  const queryClient = useQueryClient();
  const detailQueryKey = ['tenant-product-detail', productId, includePerformance] as const;

  const patchDetailPricing = (
    updater: (rows: ProductDetailResponse['detail']['pricing']) => ProductDetailResponse['detail']['pricing'],
  ) => {
    queryClient.setQueriesData<ProductDetailResponse>(
      { queryKey: ['tenant-product-detail', productId] },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          detail: {
            ...old.detail,
            pricing: updater(old.detail.pricing),
          },
        };
      },
    );
  };

  const updateItem = useMutation({
    mutationFn: async ({ priceListId, itemId, price }: { priceListId: string; itemId: string; price: number }) => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to update list price');
      }

      return res.json() as Promise<{ item: { id: string; price: number } }>;
    },
    onMutate: async ({ itemId, price }) => {
      const snapshots = await takeSnapshots(queryClient, [detailQueryKey]);
      patchDetailPricing((rows) =>
        rows.map((row) =>
          row.item_id === itemId ? { ...row, list_price: price, effective_price: price } : row,
        ),
      );
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not update list price');
    },
    onSuccess: (_data, { priceListId }) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-product-detail', productId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list-products-detail'] });
      toast.success('List price updated');
    },
  });

  const addItem = useMutation({
    mutationFn: async ({ priceListId, price }: { priceListId: string; price: number }) => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_product_id: productId, price, min_qty: 1 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to add to price list');
      }

      return res.json() as Promise<{ item: { id: string; price: number } }>;
    },
    onSuccess: (data, { priceListId }) => {
      const itemId = data.item.id;
      const price = Number(data.item.price);
      patchDetailPricing((rows) =>
        rows.map((row) =>
          row.price_list_id === priceListId
            ? { ...row, item_id: itemId, list_price: price, effective_price: price }
            : row,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['tenant-product-detail', productId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list-products-detail'] });
      toast.success('Product added to price list');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not add to price list');
    },
  });

  const removeItem = useMutation({
    mutationFn: async ({ priceListId, itemId }: { priceListId: string; itemId: string }) => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to remove from price list');
      }
      return { ok: true };
    },
    onMutate: async ({ itemId }) => {
      const snapshots = await takeSnapshots(queryClient, [detailQueryKey]);
      patchDetailPricing((rows) =>
        rows.map((row) =>
          row.item_id === itemId ? { ...row, item_id: null, list_price: null, effective_price: null } : row,
        ),
      );
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not remove from price list');
    },
    onSuccess: (_data, { priceListId }) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-product-detail', productId] });
      queryClient.invalidateQueries({ queryKey: ['price-list', priceListId] });
      queryClient.invalidateQueries({ queryKey: ['price-list-products-detail'] });
      toast.success('Removed from price list');
    },
  });

  return { updateItem, addItem, removeItem };
}

/** @deprecated Use useProductPriceListItemMutations */
export function useUpdateProductPriceOverride(productId: string) {
  const { updateItem } = useProductPriceListItemMutations(productId, false);
  return updateItem;
}

export function useReactivateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/tenant/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) throw new Error('Failed to reactivate product');
      return res.json();
    },
    onMutate: async (id) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-products'], ['tenant-product', id]]);
      queryClient.setQueryData<TenantProductsResponse>(['tenant-products'], (old) => ({
        products: (old?.products ?? []).map((product) =>
          product.id === id ? { ...product, is_active: true, updated_at: new Date().toISOString() } : product,
        ),
      }));
      queryClient.setQueryData<{ product: TenantProduct }>(['tenant-product', id], (old) =>
        old?.product
          ? { product: { ...old.product, is_active: true, updated_at: new Date().toISOString() } }
          : old,
      );
      return { snapshots };
    },
    onError: (_error, _id, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(_error instanceof Error ? _error.message : 'Could not reactivate product');
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-product', id] });
    },
  });
}

export interface CreateCustomProductError {
  status: number;
  error: string;
  details?: unknown;
}

export function useCreateCustomProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CustomProductInput): Promise<{ product: TenantProduct }> => {
      const res = await apiPost('/api/tenant/products', data);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw { status: res.status, ...(err as object) } as CreateCustomProductError;
      }

      return res.json() as Promise<{ product: TenantProduct }>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
    },
    onError: (error) => {
      const message =
        error &&
        typeof error === 'object' &&
        'error' in error &&
        typeof (error as { error?: unknown }).error === 'string'
          ? (error as { error: string }).error
          : error instanceof Error
            ? error.message
            : 'Could not create product';
      toast.error(message);
    },
  });
}

export function useTenantProductCategories() {
  return useQuery({
    queryKey: ['tenant-product-categories'],
    queryFn: async (): Promise<string[]> => {
      const res = await apiFetch('/api/tenant/categories');
      if (!res.ok) return [];
      const data = await res.json() as { categories: string[] };
      return data.categories ?? [];
    },
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
}
