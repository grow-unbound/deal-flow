'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { CatalogComposerFilterState, CatalogComposerPayload, CatalogComposerPriceSource, CatalogComposerTag } from '@/lib/zod';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';

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
  conversions?: number;
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
    expiring7d: number;
    gmv_mtd: number;
    gmv_prev_mtd: number;
    gmv_growth_pct: number;
    avg_conversion_pct: number;
    orders_attributed_mtd: number;
    conversions_mtd?: number;
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
    selected_cohort: {
      id: string | null;
      name: string;
      member_count: number;
      scope_type: 'cohort' | 'buyer' | 'geography' | 'all';
      display_label: string;
    };
  };
  meta_strip_4: {
    gmv: number;
    growth_pct: number;
    orders: number;
    conversions?: number;
    order_count?: number;
    estimate_count?: number;
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
  products_summary: {
    filters: CatalogComposerFilterState;
    included_count: number;
    brands_covered: number;
    in_stock_count: number;
    tag_overrides_count: number;
  };
  products: Array<{
    tenant_product_id: string;
    product_name: string;
    internal_sku: string;
    brand_name: string;
    catalog_gmv: number;
    catalog_units_sold: number;
    stock_label: string;
    stock_tone: 'success' | 'warning' | 'neutral';
    mrp: number | null;
    base_selling_price: number | null;
    units_mtd: number;
    days_cover: number | null;
    tag: CatalogComposerTag | null;
    override_price: number | null;
    catalog_order: number;
  }>;
  performance: {
    channels?: {
      estimates_enabled: boolean;
      orders_enabled: boolean;
    };
    summary: {
      orders: number;
      conversions?: number;
      order_count?: number;
      estimate_count?: number;
      gmv: number;
      growth_pct: number;
      aov: number;
      views: number;
      unique_viewers: number;
      conversion_rate: number;
      abandoners: number;
      valid_until_label: string;
      published_at_label: string;
    };
    funnel: {
      unique_viewers: number;
      conversions: number;
      orders: number;
      estimates?: number;
      gmv: number;
    };
    daily: Array<{
      date: string;
      revenue: number;
      conversion_rate: number;
    }>;
    cumulative_orders: Array<{
      date: string;
      orders_cumulative: number;
      gmv_cumulative: number;
    }>;
    top_skus: Array<{
      tenant_product_id: string;
      product_name: string;
      internal_sku: string;
      gmv: number;
      units: number;
    }>;
    per_buyer_activity: Array<{
      buyer_id: string;
      buyer_name: string;
      city: string;
      opened_status: 'Opened' | 'Converted' | 'Not yet';
      orders: number;
      gmv: number;
      last_opened_at: string | null;
      last_order_at: string | null;
    }>;
  };
  buyers: Array<{
    buyer_id: string;
    buyer_name: string;
    city: string;
    cohort_label: string;
    opened_status: 'Opened' | 'Converted' | 'Not yet';
    spend: number;
    orders: number;
    last_opened_at: string | null;
    last_order_at: string | null;
  }>;
  permissions: {
    can_extend_validity: boolean;
    can_edit_composition: boolean;
  };
  composer?: {
    name: string;
    status: 'draft' | 'published' | 'archived';
    live_status: 'draft' | 'published' | 'archived';
    has_unpublished_changes: boolean;
    valid_from: string;
    valid_to: string | null;
    scope_type: 'cohort' | 'buyer' | 'all';
    cohort_id: string | null;
    buyer_ids?: string[];
    message?: string | null;
    price_source?: CatalogComposerPriceSource;
    price_list_id?: string | null;
    filters: CatalogComposerFilterState;
    tag_overrides: Record<string, CatalogComposerTag | null>;
    items: Array<{
      tenant_product_id: string;
      display_order: number;
      price_override?: number | null;
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
  cost_price: number | null;
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
  buyer_count: number;
  can_view_cost: boolean;
  buyers: Array<{
    id: string;
    business_name: string;
    contact_name: string | null;
    external_ref: string | null;
    city: string | null;
    state: string | null;
    geography_label: string;
    tier: 'A' | 'B' | 'C' | null;
    credit_limit: number;
    payment_terms_days: number;
    orders_30d: number;
    gmv_30d: number;
    last_order_at: string | null;
    initials: string;
    hue: 'teal' | 'ember' | 'cream';
  }>;
  buyer_filters: {
    geographies: Array<{ value: string; label: string; count: number }>;
    tiers: Array<{ value: string; label: string; count: number }>;
  };
  price_lists: Array<{
    id: string;
    name: string;
    status: 'active' | 'draft';
    valid_from: string | null;
    valid_to: string | null;
  }>;
  price_list_items: Array<{
    price_list_id: string;
    tenant_product_id: string;
    price: number;
  }>;
  products: CatalogComposerProduct[];
}

export interface CatalogComposerBuyerPickerRow {
  id: string;
  business_name: string;
  city: string;
  spend_mtd: number;
  outstanding_due: number;
  last_order_at: string | null;
  ordered_30d: boolean;
  overdue: boolean;
  avatar: {
    initials: string;
    hue: 'teal' | 'ember' | 'cream';
  };
}

export interface CatalogComposerBuyerPickerResponse {
  buyers: CatalogComposerBuyerPickerRow[];
  selected_buyers: CatalogComposerBuyerPickerRow[];
  filters: LandingFilterMeta;
  nextCursor: string | null;
}

export interface CatalogComposerBuyerPickerFilters {
  query?: string;
  city?: string[];
  cohort?: string[];
  orders?: string[];
  dues?: string[];
  selectedIds?: string[];
  limit?: number;
}

export interface ExtendValidityRequest {
  valid_until: string;
}

export interface CatalogCompositionMutationRequest {
  tenant_product_id: string;
  price_override?: number | null;
}

export interface CatalogShareLinkResponse {
  share_token: string;
  share_url: string;
}

export function useTenantCatalogs(period: SellerLandingPeriod = 'month', initialData?: CatalogsLandingResponse | null) {
  return useQuery({
    queryKey: ['tenant-catalogs', period],
    queryFn: async (): Promise<CatalogsLandingResponse> => {
      const res = await apiFetch(`/api/tenant/catalogs?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch catalogs');
      return res.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
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
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
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
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
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
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCatalogComposerBuyerPicker({
  query,
  city = [],
  cohort = [],
  orders = [],
  dues = [],
  selectedIds = [],
  limit = 30,
  enabled = true,
}: CatalogComposerBuyerPickerFilters & { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ['catalog-composer-buyer-picker', query?.trim() ?? '', city, cohort, orders, dues, limit],
    queryFn: async ({ pageParam, signal }): Promise<CatalogComposerBuyerPickerResponse> => {
      const params = new URLSearchParams();
      if (query?.trim()) params.set('q', query.trim());
      params.set('limit', String(limit));
      if (pageParam) params.set('cursor', pageParam as string);
      appendArrayParam(params, 'city', city);
      appendArrayParam(params, 'cohort', cohort);
      appendArrayParam(params, 'orders', orders);
      appendArrayParam(params, 'dues', dues);
      appendArrayParam(params, 'selected_id', selectedIds);
      const res = await apiFetch(`/api/tenant/catalogs/buyer-picker?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch campaign buyers');
      return res.json();
    },
    enabled,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useSaveCatalogComposer(catalogId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CatalogComposerPayload): Promise<{
      catalog: { id: string; status: 'draft' | 'published' | 'archived' };
      whatsapp_notify?: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null;
    }> => {
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

      return res.json() as Promise<{
        catalog: { id: string; status: 'draft' | 'published' | 'archived' };
        whatsapp_notify?: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null;
      }>;
    },
    onSuccess: (_data, payload) => {
      if (payload.save_mode !== 'publish') {
        toast.success('Campaign saved');
      }
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
      toast.error(_err instanceof Error ? _err.message : 'Failed to extend validity');
    },
    onSuccess: () => {
      toast.success('Validity extended');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
    },
  });
}

export interface CatalogPublishPreviewResponse {
  campaign: {
    id: string | null;
    name: string;
    valid_from: string;
    valid_to: string | null;
    audience_label: string;
    products_count: number;
    pricing_scheme: string;
    buyer_note: string;
    hero_image_url: string | null;
    header_image_url: string;
    header_image_source: 'campaign' | 'tenant_logo' | 'platform_default';
  };
  whatsapp: {
    feature_enabled: boolean;
    notify_available: boolean;
    can_notify: boolean;
    blockers: string[];
    recipient_count: number;
    credits_per_message: number;
    estimated_credits: number;
    estimated_inr: number;
    credits_balance: number;
    template_approved: boolean;
    tenant_phone_configured: boolean;
    broadcast_sending_paused: boolean;
  };
}

export interface CatalogPublishInput {
  notifyWhatsapp?: boolean;
  buyerNote?: string;
  notifyScheduledFor?: string | null;
}

export function useCatalogPublishPreview(campaignId: string, notifyWhatsapp: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['catalog-publish-preview', campaignId, notifyWhatsapp],
    queryFn: async (): Promise<CatalogPublishPreviewResponse> => {
      const params = new URLSearchParams({ notify_whatsapp: notifyWhatsapp ? 'true' : 'false' });
      const res = await apiFetch(`/api/tenant/catalogs/${campaignId}/publish-preview?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to load publish preview');
      }
      return res.json();
    },
    enabled: enabled && Boolean(campaignId),
    staleTime: 0,
  });
}

export interface ComposerPublishPreviewInput {
  notifyWhatsapp: boolean;
  scopeType: 'cohort' | 'buyer' | 'all';
  cohortId?: string | null;
  buyerIds: string[];
  name: string;
  validFrom: string;
  validTo?: string;
  productsCount: number;
  priceSource: CatalogComposerPriceSource;
  priceListName?: string | null;
  heroImageUrl?: string | null;
  campaignId?: string;
  buyerNote?: string;
}

export function useComposerPublishPreview(input: ComposerPublishPreviewInput & { enabled: boolean }) {
  const hasCampaignId = Boolean(input.campaignId);
  const savedDraftPreview = useCatalogPublishPreview(
    input.campaignId ?? '',
    input.notifyWhatsapp,
    input.enabled && hasCampaignId,
  );

  const unsavedPreview = useQuery({
    queryKey: [
      'catalog-composer-publish-preview',
      input.notifyWhatsapp,
      input.scopeType,
      input.cohortId,
      input.buyerIds,
      input.name,
      input.validFrom,
      input.validTo,
      input.productsCount,
      input.priceSource,
      input.priceListName,
      input.heroImageUrl,
    ],
    queryFn: async (): Promise<CatalogPublishPreviewResponse> => {
      const res = await apiFetch('/api/tenant/catalogs/publish-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notify_whatsapp: input.notifyWhatsapp,
          scope_type: input.scopeType,
          cohort_id: input.scopeType === 'cohort' ? input.cohortId : null,
          buyer_ids: input.scopeType === 'buyer' ? input.buyerIds : [],
          name: input.name,
          valid_from: input.validFrom ? `${input.validFrom}T00:00:00.000Z` : new Date().toISOString(),
          valid_to: input.validTo ? `${input.validTo}T23:59:59.000Z` : null,
          products_count: input.productsCount,
          price_source: input.priceSource,
          price_list_name: input.priceListName ?? null,
          hero_image_url: input.heroImageUrl ?? null,
          buyer_note: input.buyerNote ?? '',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to load publish preview');
      }
      return res.json();
    },
    enabled: input.enabled && !hasCampaignId,
    staleTime: 0,
  });

  if (hasCampaignId) {
    return {
      data: savedDraftPreview.data,
      isLoading: savedDraftPreview.isLoading,
      error: savedDraftPreview.error,
    };
  }

  return {
    data: unsavedPreview.data,
    isLoading: unsavedPreview.isLoading,
    error: unsavedPreview.error,
  };
}

export function usePublishCatalog(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input?: CatalogPublishInput) => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish_catalog',
          notify_whatsapp: input?.notifyWhatsapp ?? false,
          buyer_note: input?.buyerNote,
          notify_scheduled_for: input?.notifyScheduledFor ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to publish catalog');
      }

      return res.json() as Promise<{
        ok: true;
        share_link: CatalogShareLinkResponse;
        whatsapp_notify?: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null;
      }>;
    },
    onMutate: async () => {
      const snapshots = await takeSnapshots(queryClient, [['tenant-catalog-detail', id], ['tenant-catalogs']]);

      queryClient.setQueryData<CatalogDetailResponse>(['tenant-catalog-detail', id], (old) =>
        old
          ? {
              ...old,
              header: {
                ...old.header,
                status_label: 'Live',
                status_tone: 'success',
                status_value: 'published',
              },
              permissions: {
                ...old.permissions,
                can_edit_composition: false,
              },
            }
          : old,
      );

      return { snapshots };
    },
    onError: (_err, _payload, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(_err instanceof Error ? _err.message : 'Publish failed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-composer-detail', id] });
    },
  });
}

export function useEnsureCatalogShareLink(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ensure_share_link' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to generate share link');
      }

      return res.json() as Promise<{ share_link: CatalogShareLinkResponse }>;
    },
    onSuccess: ({ share_link }) => {
      queryClient.setQueryData<CatalogDetailResponse>(['tenant-catalog-detail', id], (old) =>
        old
          ? {
              ...old,
              header: {
                ...old.header,
                share_token: share_link.share_token,
                share_url: share_link.share_url,
              },
            }
          : old,
      );
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
