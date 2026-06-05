'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import type { CatalogComposerFilterState, CatalogComposerPayload, CatalogComposerTag } from '@/lib/zod';
import type { SellerLandingPeriod, SellerLandingPeriodMeta } from '@/lib/seller-period';

export type CatalogDisplayStatus = 'Live' | 'Draft' | 'Ended';
export type CatalogStatusTone = 'success' | 'warning' | 'neutral';
export type CatalogAvatarHue = 'teal' | 'ember' | 'cream';

export interface CatalogLandingRow {
  id: string;
  name: string;
  initials: string;
  hue: CatalogAvatarHue;
  status: {
    value: 'draft' | 'published' | 'archived';
    label: CatalogDisplayStatus;
    tone: CatalogStatusTone;
  };
  cohort_name: string;
  products_count: number;
  brands_count: number;
  gmv: number;
  orders: number;
  views: number;
  conversion_pct: number;
  valid_from: string;
  valid_to: string | null;
  valid_until_label: string;
  days_left: number | null;
  created_at: string;
  growth_pct: number;
}

export interface CatalogsLandingResponse {
  period?: SellerLandingPeriodMeta;
  kpis: {
    live_catalogs: number;
    draft_catalogs: number;
    ended_catalogs: number;
    gmv_mtd: number;
    gmv_prev_mtd: number;
    gmv_growth_pct: number;
    avg_conversion_pct: number;
    orders_attributed_mtd: number;
  };
  todays_read: {
    needs_attention: CatalogLandingRow[];
    top_performers: CatalogLandingRow[];
    top_risers: CatalogLandingRow[];
  };
  catalogs: CatalogLandingRow[];
}

export interface CatalogDetailResponse {
  header: {
    id: string;
    name: string;
    status_label: CatalogDisplayStatus;
    status_tone: CatalogStatusTone;
    initials: string;
    products_count: number;
    brands_covered: number;
    cohort_name: string;
    valid_from_label: string;
    valid_until_label: string;
    valid_until_iso: string | null;
    published_by: string;
    share_token: string | null;
    share_url: string | null;
    scope_type: 'cohort' | 'buyer' | 'geography' | 'all';
    status_value: 'draft' | 'published' | 'archived';
  };
  meta_strip_4: {
    gmv: number;
    growth_pct: number;
    orders: number;
    conversion_rate: number;
    unique_viewers: number;
    cohort_members: number;
    days_left: number;
    valid_until_label: string;
  };
  composition: Array<{
    tenant_product_id: string;
    product: string;
    brand: string;
    mrp: number;
    catalog_price: number;
    override_price: number | null;
    stock_status: 'In stock' | 'Low stock' | 'Out of stock' | string;
  }>;
  performance: {
    funnel: {
      unique_viewers: number;
      cart_additions: number;
      orders: number;
      gmv: number;
    };
    daily: Array<{
      date: string;
      revenue: number;
      conversion_rate: number;
    }>;
  };
  buyers: Array<{
    buyer_id: string;
    buyer_name: string;
    status: 'Ordered' | 'Viewed' | 'Not opened' | string;
    spend: number;
    orders: number;
  }>;
  permissions: {
    can_extend_validity: boolean;
    can_edit_composition: boolean;
  };
  composer?: {
    name: string;
    status: 'draft' | 'published' | 'archived';
    valid_from: string;
    valid_to: string | null;
    cohort_id: string | null;
    filters: CatalogComposerFilterState;
    tag_overrides: Record<string, CatalogComposerTag | null>;
    items: Array<{
      tenant_product_id: string;
      display_order: number;
    }>;
  };
}

export interface CatalogComposerProduct {
  id: string;
  display_name: string;
  internal_sku: string;
  brand_name: string;
  category_name: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  qty_available: number;
  reorder_point: number;
  units_mtd: number;
  days_cover: number | null;
  tag: CatalogComposerTag | null;
  stock_added_today: boolean;
  stock_label: string;
  stock_tone: 'success' | 'warning' | 'neutral';
}

export interface CatalogComposerBootstrapResponse {
  cohorts: Array<{
    id: string;
    name: string;
    member_count: number;
  }>;
  products: CatalogComposerProduct[];
}

export interface ExtendValidityRequest {
  valid_until: string;
}

export interface CatalogCompositionMutationRequest {
  tenant_product_id: string;
  price_override?: number | null;
}

export function useTenantCatalogs(period: SellerLandingPeriod = 'month', initialData?: CatalogsLandingResponse | null) {
  return useQuery({
    queryKey: ['tenant-catalogs', period],
    queryFn: async (): Promise<CatalogsLandingResponse> => {
      const res = await apiFetch(`/api/tenant/catalogs?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch catalogs');
      return res.json();
    },
    initialData: initialData ?? undefined,
    staleTime: 30_000,
  });
}

export function useTenantCatalogDetail(id: string) {
  return useQuery({
    queryKey: ['tenant-catalog-detail', id],
    queryFn: async (): Promise<CatalogDetailResponse> => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`);
      if (!res.ok) throw new Error('Failed to fetch catalog detail');
      return res.json();
    },
    enabled: Boolean(id),
  });
}

export function useCatalogComposerBootstrap(enabled = true) {
  return useQuery({
    queryKey: ['catalog-composer-bootstrap'],
    queryFn: async (): Promise<CatalogComposerBootstrapResponse> => {
      const res = await apiFetch('/api/tenant/catalogs/composer');
      if (!res.ok) throw new Error('Failed to fetch catalog composer data');
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useCatalogComposerDetail(id: string) {
  return useQuery({
    queryKey: ['catalog-composer-detail', id],
    queryFn: async (): Promise<CatalogDetailResponse> => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`);
      if (!res.ok) throw new Error('Failed to fetch catalog composer detail');
      return res.json();
    },
    enabled: Boolean(id),
  });
}

export function useSaveCatalogComposer(catalogId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CatalogComposerPayload): Promise<{ catalog: { id: string; status: 'draft' | 'published' | 'archived' } }> => {
      const url = catalogId ? `/api/tenant/catalogs/${catalogId}` : '/api/tenant/catalogs';
      const method = catalogId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save catalog');
      }

      return res.json() as Promise<{ catalog: { id: string; status: 'draft' | 'published' | 'archived' } }>;
    },
    onSuccess: (_data, _payload) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-composer-bootstrap'] });
      if (catalogId) {
        queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', catalogId] });
        queryClient.invalidateQueries({ queryKey: ['catalog-composer-detail', catalogId] });
      }
    },
  });
}

export function useExtendCatalogValidity(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ExtendValidityRequest) => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extend_validity', valid_until: payload.valid_until }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to extend validity');
      }

      return res.json() as Promise<{ ok: true }>;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-catalog-detail', id], ['tenant-catalogs']]);

      queryClient.setQueryData<CatalogDetailResponse>(['tenant-catalog-detail', id], (old) =>
        old
          ? {
              ...old,
              header: {
                ...old.header,
                valid_until_iso: payload.valid_until,
                valid_until_label: new Date(payload.valid_until).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }),
              },
            }
          : old,
      );

      return { snapshots };
    },
    onError: (_err, _payload, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
    },
  });
}

export function useAddCatalogProduct(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CatalogCompositionMutationRequest) => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_product',
          tenant_product_id: payload.tenant_product_id,
          price_override: payload.price_override ?? null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to add catalog product');
      }

      return res.json() as Promise<{ ok: true }>;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-catalog-detail', id]]);

      queryClient.setQueryData<CatalogDetailResponse>(['tenant-catalog-detail', id], (old) =>
        old
          ? {
              ...old,
              composition: [
                {
                  tenant_product_id: payload.tenant_product_id,
                  product: 'Added product',
                  brand: '—',
                  mrp: 0,
                  catalog_price: 0,
                  override_price: payload.price_override ?? null,
                  stock_status: 'In stock',
                },
                ...old.composition,
              ],
            }
          : old,
      );

      return { snapshots };
    },
    onError: (_err, _payload, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
    },
  });
}

export function useRemoveCatalogProduct(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CatalogCompositionMutationRequest) => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_product',
          tenant_product_id: payload.tenant_product_id,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to remove catalog product');
      }

      return res.json() as Promise<{ ok: true }>;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-catalog-detail', id]]);

      queryClient.setQueryData<CatalogDetailResponse>(['tenant-catalog-detail', id], (old) =>
        old
          ? {
              ...old,
              composition: old.composition.filter((item) => item.tenant_product_id !== payload.tenant_product_id),
            }
          : old,
      );

      return { snapshots };
    },
    onError: (_err, _payload, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
    },
  });
}
