'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-fetch';
import type {
  CampaignWorkflowStatus,
  CampaignWorkflowStatusLabel,
  CampaignWorkflowStatusTone,
  RawCampaignStatus,
} from '@/lib/campaign-workflow-status';
import { appendArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME, REFERENCE_QUERY_STALE_TIME, REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';
import type {
  BuyerMembershipRules,
  CampaignBuyerTargetMode,
  CampaignFormPayload,
  CatalogComposerFilterState,
  CatalogComposerPayload,
  CatalogComposerPriceSource,
  CatalogComposerPricingStrategy,
  CatalogComposerTag,
  MembershipMode,
  ProductMembershipRules,
} from '@/lib/zod';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';

export type CatalogDisplayStatus = CampaignWorkflowStatusLabel;
export type CatalogStatusTone = CampaignWorkflowStatusTone;
export type CatalogAvatarHue = 'teal' | 'ember' | 'cream';

export interface CatalogLandingRow {
  id: string;
  name: string;
  initials: string;
  hue: CatalogAvatarHue;
  status: {
    value: CampaignWorkflowStatus;
    raw_value?: RawCampaignStatus;
    label: CatalogDisplayStatus;
    tone: CatalogStatusTone;
  };
  cohort_name: string;
  audience_count: number | null;
  products_count: number;
  brands_count: number;
  gmv: number;
  /** @deprecated Use order_count — kept for backward compatibility */
  orders: number;
  order_count: number;
  estimate_count: number;
  conversions: number;
  demand_customers?: number;
  invoice_value?: number;
  invoice_count?: number;
  revenue_buyer_count?: number;
  views: number;
  view_pct: number;
  conversion_pct: number;
  valid_from: string;
  valid_to: string | null;
  valid_until_label: string;
  days_left: number | null;
  created_at: string;
  growth_pct: number;
}

export interface CatalogsLandingResponse {
  total?: number;
  limit?: number;
  nextCursor?: string | null;
  period?: SellerLandingPeriodMeta;
  channels?: {
    orders_enabled: boolean;
    estimates_enabled: boolean;
  };
  primary_demand_kind?: 'orders' | 'estimates' | 'none';
  kpis: {
    live_catalogs: number;
    draft_catalogs: number;
    ended_catalogs: number;
    expiring7d: number;
    scheduled_catalogs?: number;
    opened_customers_mtd?: number;
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

export interface CatalogsLandingKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface CatalogsLandingMetricsV4 {
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
  cards: CatalogsLandingKpiCardV4[];
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
    hero_image_url: string | null;
    published_by: string;
    share_token: string | null;
    share_url: string | null;
    scope_type: 'cohort' | 'buyer' | 'geography' | 'all';
    status_value: CampaignWorkflowStatus;
    status_raw_value?: RawCampaignStatus;
    selected_cohort: {
      id: string | null;
      name: string;
      member_count: number;
      scope_type: 'cohort' | 'buyer' | 'geography' | 'all';
      display_label: string;
    };
  };
  /** Quarter-to-date KPI strip, sourced from metrics_campaign_period_summary (grain='quarter'). */
  meta_strip_4: {
    target_buyer_count: number;
    viewed_buyer_count: number;
    view_count: number;
    view_rate_pct: number;
    demand_buyer_count: number;
    demand_value: number;
    demand_count: number;
    enquiry_rate_pct: number;
    revenue_buyer_count: number;
    invoice_value: number;
    invoice_count: number;
    billing_rate_pct: number;
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
      demand_customers?: number;
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
      demand_customers?: number;
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
  performance_cards?: unknown[];
  detail_v2?: unknown;
  buyers: Array<{
    buyer_id: string;
    buyer_name: string;
    city: string;
    geography_label?: string;
    cohort_label: string;
    opened_status: 'NOT YET OPENED' | 'OPENED' | 'CONVERTED' | 'Opened' | 'Converted' | 'Not yet';
    spend: number;
    orders: number;
    demand_value?: number;
    demand_count?: number;
    last_opened_at: string | null;
    last_order_at: string | null;
    last_conversion_at?: string | null;
    last_primary_demand_at?: string | null;
    is_member?: boolean;
    buyer_app_status?: 'enabled' | 'not_enabled' | 'inactive';
    primary_demand_kind?: 'orders' | 'estimates' | 'none';
  }>;
  permissions: {
    can_extend_validity: boolean;
    can_edit_composition: boolean;
  };
  composer?: {
    name: string;
    description?: string;
    status: CampaignWorkflowStatus;
    live_status: CampaignWorkflowStatus;
    has_unpublished_changes: boolean;
    valid_from: string;
    valid_to: string | null;
    scope_type: 'cohort' | 'buyer' | 'all';
    cohort_id: string | null;
    buyer_ids?: string[];
    message?: string | null;
    price_source?: CatalogComposerPriceSource;
    price_list_id?: string | null;
    pricing_strategy?: CatalogComposerPricingStrategy;
    filters: CatalogComposerFilterState;
    is_dynamic?: boolean;
    buyer_target_mode?: CampaignBuyerTargetMode;
    buyer_rules?: BuyerMembershipRules;
    product_membership_mode?: MembershipMode;
    product_rules?: ProductMembershipRules;
    tag_overrides: Record<string, CatalogComposerTag | null>;
    items: Array<{
      tenant_product_id: string;
      display_order: number;
      price_override?: number | null;
    }>;
  };
}

function campaignInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export interface CatalogBuyerPage {
  rows: CatalogDetailResponse['buyers'];
  total: number;
  totals: { opens: number; converted: number; gmv: number };
  limit: number;
  offset: number;
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
  product_count: number;
  product_filters: {
    brands: Array<{ id: string; label: string; count: number }>;
    categories: Array<{ id: string; label: string; count: number }>;
  };
}

export interface CatalogComposerProductsResponse {
  products: CatalogComposerProduct[];
  total: number;
  nextCursor: string | null;
}

export interface CatalogComposerProductFilters {
  query?: string;
  brands?: string[];
  categories?: string[];
  availability?: CatalogComposerFilterState['availability'];
  limit?: number;
  enabled?: boolean;
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

export interface CatalogsLandingFilters {
  search?: string;
  status?: string[];
  conversion?: string[];
  filter_preset?: Record<string, unknown> | null;
}

export function useTenantCatalogs(
  period: SellerLandingPeriod = 'month',
  filters: CatalogsLandingFilters = {},
  initialData?: CatalogsLandingResponse | null,
) {
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;
  const hasFilters = Boolean(filters.search?.trim() || filters.status?.length || filters.conversion?.length || presetKey);
  const baseSummary = getSellerLandingInitialData(period, initialData);
  const initial = !hasFilters
    ? baseSummary
    : undefined;
  const query = useInfiniteQuery({
    queryKey: ['tenant-catalogs', period, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<CatalogsLandingResponse> => {
      const params = new URLSearchParams({ period, limit: '50', include_summary: String(!pageParam && !hasFilters) });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'conversion', filters.conversion);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
      const res = await apiFetch(`/api/tenant/catalogs?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch catalogs');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: initial ? { pages: [initial], pageParams: [undefined] } : undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    placeholderData: keepPreviousData,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'catalogs');
  return { ...query, data: merged && baseSummary ? { ...baseSummary, ...merged } : merged };
}

export function useTenantCatalogsMetrics(initialData?: CatalogsLandingMetricsV4 | null) {
  return useQuery({
    queryKey: ['tenant-catalogs-metrics'],
    queryFn: async (): Promise<CatalogsLandingMetricsV4> => {
      const res = await apiFetch('/api/tenant/catalogs/metrics');
      if (!res.ok) throw new Error('Failed to fetch campaign metrics');
      return res.json();
    },
    initialData: initialData ?? undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
}

export function useTenantCatalogDetail(id: string, options?: { includePerformance?: boolean }) {
  return useQuery({
    queryKey: ['tenant-catalog-detail', id, options?.includePerformance ?? true],
    queryFn: async (): Promise<CatalogDetailResponse> => {
      const params = new URLSearchParams();
      params.set('include_performance', String(options?.includePerformance ?? true));
      const res = await apiFetch(`/api/tenant/catalogs/${id}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch catalog detail');
      return res.json();
    },
    enabled: Boolean(id),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCatalogBuyers(id: string, filters: {
  query?: string;
  status?: string[];
  member?: string;
  lastSale?: string[];
  sales90d?: string[];
  buyerApp?: string[];
  sort?: string;
  page?: number;
}, enabled = true) {
  return useQuery<CatalogBuyerPage>({
    queryKey: ['tenant-catalog-buyers', id, filters],
    enabled: Boolean(id) && enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: '50' });
      params.set('offset', String(Math.max(0, filters.page ?? 0) * 50));
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      if (filters.member) params.set('member', filters.member);
      filters.status?.forEach((value) => params.append('status', value));
      filters.lastSale?.forEach((value) => params.append('last_sale', value));
      filters.sales90d?.forEach((value) => params.append('sales_90d', value));
      filters.buyerApp?.forEach((value) => params.append('buyer_app', value));
      if (filters.sort) params.set('sort', filters.sort);
      const res = await apiFetch(`/api/tenant/catalogs/${id}/buyers?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch catalog buyers');
      return res.json();
    },
    placeholderData: (previous) => previous,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
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
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
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
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCatalogComposerProducts({
  query,
  brands = [],
  categories = [],
  availability = 'show_everything',
  limit = 50,
  enabled = true,
}: CatalogComposerProductFilters) {
  return useInfiniteQuery({
    queryKey: ['catalog-composer-products', query?.trim() ?? '', brands, categories, availability, limit],
    queryFn: async ({ pageParam, signal }): Promise<CatalogComposerProductsResponse> => {
      const params = new URLSearchParams();
      if (query?.trim()) params.set('q', query.trim());
      params.set('availability', availability);
      params.set('limit', String(limit));
      if (pageParam) params.set('cursor', pageParam as string);
      appendArrayParam(params, 'brand', brands);
      appendArrayParam(params, 'category', categories);
      const res = await apiFetch(`/api/tenant/catalogs/composer/products?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch campaign products');
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
    onMutate: async (payload) => {
      if (!catalogId) return {};
      const snapshots = await takeSnapshots(queryClient, [
        ['tenant-catalog-detail', catalogId],
        ['catalog-composer-detail', catalogId],
      ]);
      queryClient.setQueryData(['catalog-composer-detail', catalogId], (old: unknown) =>
        old ? { ...(old as object), ...payload } : old,
      );
      return { snapshots };
    },
    onError: (err, _payload, context) => {
      rollbackSnapshots(queryClient, context?.snapshots);
      toast.error(err instanceof Error ? err.message : 'Failed to save catalog');
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

export function useSaveSimpleCatalog(catalogId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CampaignFormPayload): Promise<{ catalog: { id: string; status: 'draft' | 'published' | 'archived' } }> => {
      const url = catalogId ? `/api/tenant/catalogs/${catalogId}` : '/api/tenant/catalogs';
      const method = catalogId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save campaign');
      }
      return res.json();
    },
    onMutate: async (payload) => {
      const keys: (readonly unknown[])[] = [['tenant-catalogs']];
      if (catalogId) keys.push(['tenant-catalog-detail', catalogId]);
      const snapshots = await takeSnapshots(queryClient, keys);
      const optimisticId = catalogId ?? `optimistic-${Date.now()}`;
      const optimisticCreatedAt = new Date().toISOString();

      if (catalogId) {
        queryClient.setQueryData<CatalogDetailResponse>(['tenant-catalog-detail', catalogId], (old) =>
          old
            ? {
                ...old,
                header: {
                  ...old.header,
                  name: payload.name,
                  scope_type: payload.target_mode === 'customer_group' ? 'cohort' : 'buyer',
                },
                composer: old.composer
                  ? {
                      ...old.composer,
                      name: payload.name,
                      description: payload.description ?? '',
                      valid_from: payload.valid_from.toISOString(),
                      valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
                      message: payload.buyer_note ?? '',
                      scope_type: payload.target_mode === 'customer_group' ? 'cohort' : 'buyer',
                      cohort_id: payload.target_mode === 'customer_group' ? payload.target_cohort_id ?? null : null,
                      price_source: payload.pricing_mode === 'pricelist' ? 'price_list' : 'manual',
                      price_list_id: payload.pricing_mode === 'pricelist' ? payload.price_list_id ?? null : null,
                    }
                  : old.composer,
              }
            : old,
        );
      }

      queryClient.setQueriesData<InfiniteData<CatalogsLandingResponse, number>>(
        { queryKey: ['tenant-catalogs'] },
        (old) => {
          if (!old || old.pages.length === 0) return old;

          const firstPage = old.pages[0];
          const matchingExisting = firstPage.catalogs.find((catalog) => catalog.id === catalogId);
          const cohortOptions = queryClient.getQueryData<Array<{ id: string; name: string }>>(['tenant-cohort-options']) ?? [];
          const cohortName = payload.target_mode === 'customer_group'
            ? (cohortOptions.find((cohort) => cohort.id === payload.target_cohort_id)?.name ?? matchingExisting?.cohort_name ?? 'Selected customer group')
            : 'Individual buyers';

          const nextRow: CatalogLandingRow = {
            id: optimisticId,
            name: payload.name,
            initials: matchingExisting?.initials ?? campaignInitials(payload.name),
            hue: matchingExisting?.hue ?? 'ember',
            status: matchingExisting?.status ?? {
              value: 'draft',
              label: 'Draft',
              tone: 'warning',
            },
            cohort_name: cohortName,
            audience_count: matchingExisting?.audience_count ?? (payload.target_mode === 'customer_group' ? null : 0),
            products_count: matchingExisting?.products_count ?? 0,
            brands_count: matchingExisting?.brands_count ?? 0,
            gmv: matchingExisting?.gmv ?? 0,
            orders: matchingExisting?.orders ?? 0,
            order_count: matchingExisting?.order_count ?? 0,
            estimate_count: matchingExisting?.estimate_count ?? 0,
            conversions: matchingExisting?.conversions ?? 0,
            demand_customers: matchingExisting?.demand_customers ?? 0,
            views: matchingExisting?.views ?? 0,
            view_pct: matchingExisting?.view_pct ?? 0,
            conversion_pct: matchingExisting?.conversion_pct ?? 0,
            valid_from: payload.valid_from.toISOString(),
            valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
            valid_until_label: matchingExisting?.valid_until_label ?? 'Not set',
            days_left: matchingExisting?.days_left ?? null,
            created_at: matchingExisting?.created_at ?? optimisticCreatedAt,
            growth_pct: matchingExisting?.growth_pct ?? 0,
          };

          const updatedFirstPage: CatalogsLandingResponse = {
            ...firstPage,
            total: (firstPage.total ?? firstPage.catalogs.length) + (catalogId ? 0 : 1),
            kpis: {
              ...firstPage.kpis,
              draft_catalogs: firstPage.kpis.draft_catalogs + (catalogId ? 0 : 1),
            },
            catalogs: catalogId
              ? firstPage.catalogs.map((catalog) => (catalog.id === catalogId ? { ...catalog, ...nextRow, id: catalogId } : catalog))
              : [nextRow, ...firstPage.catalogs],
          };

          return {
            ...old,
            pages: [updatedFirstPage, ...old.pages.slice(1)],
          };
        },
      );

      return { snapshots };
    },
    onError: (error, _payload, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Failed to save campaign');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
      if (catalogId) {
        queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', catalogId] });
      }
      toast.success(catalogId ? 'Campaign updated' : 'Campaign created');
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
    credit_price_inr: number;
    template_approved: boolean;
    tenant_phone_configured: boolean;
    broadcast_sending_paused: boolean;
    quality_rating_blocked: boolean;
    recipient_segments?: {
      all_eligible: number;
      not_viewed: number;
      viewed_not_ordered: number;
    };
  };
  template: {
    seller_name: string;
    seller_phone_display: string;
    footer_text: string;
    buttons: Array<{ label: string; type: 'url' | 'quick_reply' }>;
  };
}

export interface CatalogPublishVerificationResponse {
  whatsapp: {
    feature_enabled: boolean;
    notify_available: boolean;
    credits_per_message: number;
    credits_balance: number;
    credit_price_inr: number;
    template_approved: boolean;
    tenant_phone_configured: boolean;
    broadcast_sending_paused: boolean;
    quality_rating_blocked: boolean;
  };
  template: {
    seller_name: string;
    seller_phone_display: string;
    footer_text: string;
    buttons: Array<{ label: string; type: 'url' | 'quick_reply' }>;
  };
}

export type CatalogDetailDialogMode = 'first_publish' | 'publish_updates' | 'notify_buyers';
export type CatalogNotifyRecipientFilter = 'all_eligible' | 'not_viewed' | 'viewed_not_ordered';

export interface CatalogPublishInput {
  notifyWhatsapp?: boolean;
  buyerNote?: string;
  notifyScheduledFor?: string | null;
  heroImageUrl?: string | null;
}

export function useCatalogPublishPreview(
  campaignId: string,
  options: {
    notifyWhatsapp: boolean;
    mode?: Extract<CatalogDetailDialogMode, 'first_publish' | 'notify_buyers'>;
  },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['catalog-publish-preview', campaignId, options.notifyWhatsapp, options.mode ?? 'first_publish'],
    queryFn: async (): Promise<CatalogPublishPreviewResponse> => {
      const params = new URLSearchParams({
        notify_whatsapp: options.notifyWhatsapp ? 'true' : 'false',
        mode: options.mode ?? 'first_publish',
      });
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

export function useCatalogPublishVerification(campaignId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['catalog-publish-verification', campaignId],
    queryFn: async (): Promise<CatalogPublishVerificationResponse> => {
      const res = await apiFetch(`/api/tenant/catalogs/${campaignId}/publish-verification`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to load WhatsApp verification');
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
    {
      notifyWhatsapp: input.notifyWhatsapp,
      mode: 'first_publish',
    },
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
          hero_image_url: input?.heroImageUrl ?? undefined,
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

export function usePublishCatalogUpdates(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input?: Pick<CatalogPublishInput, 'buyerNote' | 'heroImageUrl'>) => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish_catalog_updates',
          buyer_note: input?.buyerNote,
          hero_image_url: input?.heroImageUrl ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to publish campaign updates');
      }

      return res.json() as Promise<{ ok: true }>;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Publish failed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-composer-detail', id] });
    },
  });
}

export function useNotifyCatalogBuyers(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      recipientFilter: CatalogNotifyRecipientFilter;
      buyerNote?: string;
      notifyScheduledFor?: string | null;
    }) => {
      const res = await apiFetch(`/api/tenant/catalogs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_catalog_buyers',
          recipient_filter: input.recipientFilter,
          buyer_note: input.buyerNote,
          notify_scheduled_for: input.notifyScheduledFor ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to notify buyers');
      }

      return res.json() as Promise<{
        ok: true;
        whatsapp_notify?: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null;
      }>;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Notify failed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-catalogs'] });
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

export function useAddCampaignBuyers(catalogId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (buyerIds: string[]) => {
      const res = await apiFetch(`/api/tenant/catalogs/${catalogId}/buyer-membership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_ids: buyerIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to add buyers');
      }
      return res.json() as Promise<{ ok: true; count: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', catalogId] });
      toast.success('Buyers added to campaign');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not add buyers');
    },
  });
}

export function useRemoveCampaignBuyers(catalogId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (buyerIds: string[]) => {
      const results = await Promise.all(
        buyerIds.map((buyerId) =>
          apiFetch(`/api/tenant/catalogs/${catalogId}/buyer-membership?buyer_id=${encodeURIComponent(buyerId)}`, { method: 'DELETE' }),
        ),
      );
      const failed = results.find((res) => !res.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to remove buyers');
      }
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-catalog-detail', catalogId] });
      toast.success('Buyers removed from campaign');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove buyers');
    },
  });
}
