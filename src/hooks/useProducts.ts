'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CustomProductInput } from '@/lib/zod';
import { apiFetch, apiPost } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';

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
  on_hand?: number;
  days_cover?: number;
  units_mtd?: number;
  gmv_mtd?: number;
  growth_pct?: number;
  status_label?: string;
  status_tone?: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface ProductsKpis {
  active_skus: number;
  total_skus: number;
  archived_skus: number;
  out_of_stock: number;
  low_stock: number;
  revenue_mtd: number;
  revenue_prev_mtd: number;
  revenue_growth_pct: number;
}

export interface ProductsTodaysReadItem {
  id: string;
  name: string;
  brand: string;
  brand_initials: string;
  brand_hue: 'teal' | 'ember' | 'cream';
  on_hand: number;
  days_cover: number;
  growth_pct: number;
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
      growth_pct: number;
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
        growth_pct: number;
        revenue_last_30d: number;
      };
    };
    pricing_summary: {
      mrp: number | null;
      base_selling_price: number | null;
      cost_price: number | null;
      margin_pct: number | null;
    };
    pricing: Array<{
      item_id: string;
      price_list_id: string;
      price_list_name: string;
      effective_price: number;
      cohorts: string[];
      valid_from: string | null;
      valid_to: string | null;
      is_active: boolean;
      has_override: boolean;
      base_price: number;
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
  products: TenantProduct[];
  brands?: string[];
  kpis?: ProductsKpis;
  todays_read?: {
    needs_attention: ProductsTodaysReadItem[];
    top_performers: ProductsTodaysReadItem[];
    top_risers: ProductsTodaysReadItem[];
  };
}

export interface SearchProductsResponse {
  products: MasterProduct[];
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

export function useTenantProducts() {
  return useQuery({
    queryKey: ['tenant-products'],
    queryFn: async (): Promise<TenantProductsResponse> => {
      const res = await apiFetch('/api/tenant/products');
      if (!res.ok) {
        throw new Error('Failed to fetch products');
      }
      return res.json();
    },
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
    staleTime: 30_000,
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

      const data = await res.json();
      return data.product as TenantProduct;
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
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
    },

    onSuccess: () => {
      toast.success('Product added to your catalog');
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
  });
}

export function useProductDetail(id: string) {
  return useQuery({
    queryKey: ['tenant-product-detail', id],
    queryFn: async (): Promise<ProductDetailResponse> => {
      const res = await apiFetch(`/api/tenant/products/${id}`);
      if (!res.ok) throw new Error('Product not found');
      return res.json() as Promise<ProductDetailResponse>;
    },
    enabled: !!id,
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TenantProduct> & { archive?: boolean } }) => {
      const res = await apiFetch(`/api/tenant/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw { status: res.status, ...err };
      }
      return res.json();
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
    onError: (_error, _vars, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
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
    onError: (_error, _id, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-products'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-product', id] });
    },
  });
}

export function useUpdateProductPriceOverride(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ priceListId, itemId, price }: { priceListId: string; itemId: string; price: number }) => {
      const res = await apiFetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to update override');
      }

      return res.json() as Promise<{ item: { id: string; price: number } }>;
    },
    onMutate: async ({ itemId, price }) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-product-detail', productId]]);
      queryClient.setQueryData<ProductDetailResponse>(['tenant-product-detail', productId], (old) => {
        if (!old) return old;
        return {
          ...old,
          detail: {
            ...old.detail,
            pricing: old.detail.pricing.map((row) =>
              row.item_id === itemId ? { ...row, effective_price: price } : row,
            ),
          },
        };
      });
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-product-detail', productId] });
      toast.success('Override updated');
    },
  });
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
    onError: (_error, _id, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
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
      toast.success('Custom product created');
    },
  });
}
