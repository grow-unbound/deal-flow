'use client';

import { useQuery } from '@tanstack/react-query';

import { REFERENCE_QUERY_STALE_TIME, REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';

export interface WauDataPoint {
  week: string;
  count: number;
}

export interface ProductViewedItem {
  tenant_product_id: string;
  product_name: string;
  sku?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  image_urls?: string[] | null;
  view_count: number;
}

export interface ProductCartItem {
  tenant_product_id: string;
  product_name: string;
  sku?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  image_urls?: string[] | null;
  add_count: number;
}

export interface CartSubmitDataPoint {
  week: string;
  value: number;
  count: number;
}

async function fetchPostHogEndpoint<T>(endpoint: string): Promise<T> {
  const res = await fetch(`/api/tenant/buyer-app/posthog/${endpoint}`);
  if (!res.ok) throw new Error(`PostHog ${endpoint} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// PostHog "Endpoints" queries can be slow/cold on first hit (ClickHouse
// cold-start, transient 5xx) -- retry a few times with the default
// exponential backoff instead of giving up after one attempt, so the widget
// recovers within the same page load instead of needing a manual hard refresh.
export function useWAU() {
  return useQuery<WauDataPoint[]>({
    queryKey: ['buyer-app-wau'],
    queryFn: () => fetchPostHogEndpoint<WauDataPoint[]>('wau'),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    retry: 3,
  });
}

export function useProductsViewed() {
  return useQuery<ProductViewedItem[]>({
    queryKey: ['buyer-app-products-viewed'],
    queryFn: () => fetchPostHogEndpoint<ProductViewedItem[]>('products-viewed'),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    retry: 3,
  });
}

export function useProductsAddedToCart() {
  return useQuery<ProductCartItem[]>({
    queryKey: ['buyer-app-products-cart'],
    queryFn: () => fetchPostHogEndpoint<ProductCartItem[]>('products-added-to-cart'),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    retry: 3,
  });
}

export function useCartSubmits() {
  return useQuery<CartSubmitDataPoint[]>({
    queryKey: ['buyer-app-cart-submits'],
    queryFn: () => fetchPostHogEndpoint<CartSubmitDataPoint[]>('cart-submits'),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    retry: 3,
  });
}
