import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { appendArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';
import { REFERENCE_QUERY_STALE_TIME, REFERENCE_QUERY_GC_TIME } from '@/lib/query-navigation';

// ─── Location document types ──────────────────────────────────────────────────

export interface LocationDocumentRow {
  id: string;
  number: string | null;
  placed_at: string | null;
  created_at: string | null;
  expires_at: string | null;
  due_date: string | null;
  buyer_name: string | null;
  place_of_supply: string | null;
  source_kind: 'buyer_app' | 'converted' | 'direct' | 'seller';
  source_label: string | null;
  campaign_name: string | null;
  items_count: number;
  total_amount: number;
  outstanding_amount: number;
  status: string;
}

export interface LocationDocumentPage {
  rows: LocationDocumentRow[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Landing page types ───────────────────────────────────────────────────────

export type LocationStockStatus = 'clear' | 'low_stock' | 'out_of_stock';

export type PrimaryDemandKind = 'orders' | 'estimates' | 'none';

export interface LocationsLandingKpis {
  active_locations: number;
  total_locations: number;
  unpaid_invoice_count: number;
  total_invoice_count: number;
  outstanding_dues_total: number;
  dues_location_count: number;
  overdue_dues_total: number;
  overdue_location_count: number;
  open_estimate_count: number;
  total_estimate_count: number;
  conversion_pct: number;
  top_location_name: string | null;
  top_location_gmv_share_pct: number;
  linked_warehouse_count: number;
  open_primary_demand_kind: PrimaryDemandKind;
  open_primary_demand_value: number;
  invoiced_sales_90d: number;
  purchasing_buyers_90d: number;
}

export interface LocationsLandingKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface LocationsLandingMetricsV4 {
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
  cards: LocationsLandingKpiCardV4[];
}

export interface LocationsLandingRow {
  id: string;
  name: string;
  city: string;
  address_text: string;
  phone_number: string | null;
  initials: string;
  gmv_mtd: number;
  active_buyers: number;
  outstanding_dues: number;
  sku_count: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
  stock_status: LocationStockStatus;
  oldest_unpaid_days: number | null;
  is_active: boolean;
  invoice_count_90d: number;
  estimate_count_90d: number;
  estimate_value_90d: number;
  order_count_90d: number;
  order_value_90d: number;
  conversion_90d: number;
  open_estimate_count: number;
  open_order_count: number;
  open_demand_count: number;
  overdue_amount: number;
  primary_demand_kind: PrimaryDemandKind;
  primary_demand_count: number;
  primary_demand_value: number;
  primary_demand_buyer_count: number;
}

export interface LocationsCalloutRow {
  id: string;
  name: string;
  city: string;
  initials: string;
  // conversions (estimates nearing expiry)
  estimate_number?: string;
  expires_in_days?: number;
  total_amount?: number;
  // top locations
  gmv_mtd?: number;
  orders_count?: number;
  buyers_count?: number;
  // collections overdue
  outstanding_dues?: number;
  oldest_unpaid_days?: number;
}

export interface LocationsLandingResponse {
  locations: LocationsLandingRow[];
  total: number | null;
  limit?: number;
  nextCursor?: string | null;
  sort?: LocationsLandingSort;
  period_key?: string;
  grain?: 'month';
  period_start?: string;
  refreshed_at: string;
  as_of?: string;
  kpis?: LocationsLandingKpis;
  callouts?: {
    conversions: LocationsCalloutRow[];
    top_locations: LocationsCalloutRow[];
    collections_overdue: LocationsCalloutRow[];
  };
  filters?: LandingFilterMeta;
}

export interface LocationsLandingFilters {
  search?: string;
  status?: string[];
  attention?: string[];
  filter_preset?: Record<string, unknown> | null;
  sort?: LocationsLandingSort;
}

export type LocationsLandingSort = 'invoice_value' | 'open_demand_value' | 'overdue_amount';

// ─── Detail page types ────────────────────────────────────────────────────────

export interface LocationDetailGmvWeek {
  week_label: string;
  week_start: string;
  gmv: number;
  orders_count: number;
}

export interface LocationDetailInventoryHealth {
  active_skus: number;
  oos_skus: number;
  low_stock_skus: number;
  avg_days_cover: number | null;
}

export interface LocationDetailTopBuyer {
  buyer_id: string;
  business_name: string;
  city: string;
  initials: string;
  spend_mtd: number;
  outstanding_dues: number;
}

export interface LocationDetailOrder {
  order_id: string;
  order_number: string;
  placed_at: string;
  buyer_name: string;
  place_of_supply: string | null;
  location_name: string | null;
  source_kind: 'buyer_app' | 'converted' | 'direct';
  source_label: string | null;
  campaign_name: string | null;
  items_count: number;
  total_amount: number;
  status: string;
}

export interface LocationDetailEstimate {
  estimate_id: string;
  estimate_number: string;
  issued_at: string;
  buyer_name: string;
  place_of_supply: string | null;
  location_name: string | null;
  source_kind: 'buyer_app' | 'seller';
  source_label: string | null;
  campaign_name: string | null;
  items_count: number;
  total_amount: number;
  expires_at: string | null;
  status: string;
}

export interface LocationDetailInvoice {
  invoice_id: string;
  invoice_number: string;
  issued_at: string;
  buyer_name: string;
  place_of_supply: string | null;
  location_name: string | null;
  source_kind: 'buyer_app' | 'converted' | 'direct';
  source_label: string | null;
  campaign_name: string | null;
  items_count: number;
  total_amount: number;
  outstanding_amount: number;
  due_date: string | null;
  status: string;
}

export interface LocationDetailActivityItem {
  id: string;
  action: string;
  entity_type: string;
  diff: Record<string, unknown> | null;
  ts: string;
  actor_name: string | null;
}

export interface LocationDetailResponse {
  id: string;
  name: string;
  city: string;
  phone_number: string | null;
  status: 'active' | 'inactive';
  initials: string;
  is_active: boolean;
  associated_users: Array<{ email: string; user_name: string | null; user_id: string | null }>;
  /** Quarter-to-date KPI strip, sourced from metrics_location_period_summary + metrics_location_now_summary. */
  meta_strip: {
    sales_qtd_value: number;
    sales_qtd_count: number;
    sales_qtd_buyer_count: number;
    demand_qtd_value: number;
    demand_qtd_count: number;
    demand_qtd_buyer_count: number;
    overdue_amount: number;
    overdue_invoice_count: number;
    invoice_count: number;
    unpaid_invoice_count: number;
    total_invoice_count: number;
    open_estimate_count: number;
    total_estimate_count: number;
    open_primary_demand_kind: PrimaryDemandKind;
    open_primary_demand_value: number;
    open_primary_demand_count: number;
  };
  overview: {
    gmv_trend: LocationDetailGmvWeek[];
    inventory_health: LocationDetailInventoryHealth;
    top_buyers: LocationDetailTopBuyer[];
  };
  orders: LocationDetailOrder[];
  estimates: LocationDetailEstimate[];
  invoices: LocationDetailInvoice[];
  activity: LocationDetailActivityItem[];
  tab_badges: {
    orders_mtd: number;
    estimates_mtd: number;
    invoices_mtd: number;
  };
  performance_cards?: unknown[];
  detail_v2?: unknown;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLocationsLanding(
  period: SellerLandingPeriod,
  filters: LocationsLandingFilters = {},
  initialData: LocationsLandingResponse | null,
) {
  const { currentTenantId } = useAuth();
  const baseSummary = initialData?.period_key === 'this_month' ? initialData : null;
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;

  const query = useInfiniteQuery<LocationsLandingResponse>({
    queryKey: ['locations-landing', currentTenantId, period, {
      search: filters.search ?? '',
      sort: filters.sort ?? 'invoice_value',
      status: filters.status ?? [],
      attention: filters.attention ?? [],
      filter_preset: presetKey,
    }],
    enabled: Boolean(currentTenantId),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'attention', filters.attention);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
      const res = await fetch(`/api/tenant/locations/landing?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`locations-landing ${res.status}`);
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: baseSummary ? { pages: [baseSummary], pageParams: [undefined] } : undefined,
    initialDataUpdatedAt: baseSummary ? 0 : undefined,
    placeholderData: keepPreviousData,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'locations');
  const data = merged && baseSummary ? { ...baseSummary, ...merged } : merged;
  const retained = useRetainedValue(data);
  return { ...query, data: data ?? retained };
}

export function useLocationsLandingMetrics(initialData?: LocationsLandingMetricsV4 | null) {
  return useQuery({
    queryKey: ['locations-landing-metrics'],
    queryFn: async (): Promise<LocationsLandingMetricsV4> => {
      const res = await fetch('/api/tenant/locations/metrics');
      if (!res.ok) throw new Error('Failed to fetch locations metrics');
      return res.json();
    },
    initialData: initialData ?? undefined,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
}

export function useLocationDetail(id: string, options?: { includePerformance?: boolean }) {
  const { currentTenantId } = useAuth();

  return useQuery<LocationDetailResponse>({
    queryKey: ['location-detail', currentTenantId, id, options?.includePerformance ?? true],
    enabled: Boolean(currentTenantId) && Boolean(id),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('include_performance', String(options?.includePerformance ?? true));
      const res = await fetch(`/api/tenant/locations/${id}/detail?${params.toString()}`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error(`location-detail ${res.status}`);
      return res.json() as Promise<LocationDetailResponse>;
    },
  });
}

export function useLocationDocuments(
  locationId: string,
  filters: {
    kind: 'order' | 'estimate' | 'invoice';
    period?: SellerLandingPeriod;
    query?: string;
    status?: string[];
    sort?: string;
  },
  enabled = true,
) {
  return useQuery<LocationDocumentPage>({
    queryKey: ['location-documents', locationId, filters],
    enabled: Boolean(locationId) && enabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ kind: filters.kind, limit: '200' });
      params.set('period', filters.period ?? 'last90');
      if (filters.query?.trim()) params.set('q', filters.query.trim());
      appendArrayParam(params, 'status', filters.status);
      if (filters.sort) params.set('sort', filters.sort);
      const res = await fetch(`/api/tenant/locations/${locationId}/documents?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch location documents');
      return res.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
