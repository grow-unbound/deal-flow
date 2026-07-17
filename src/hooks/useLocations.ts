import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { appendArrayParam } from '@/lib/landing-filter-params';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';

// ─── Landing page types ───────────────────────────────────────────────────────

export type LocationStockStatus = 'clear' | 'low_stock' | 'out_of_stock';

export interface LocationsLandingKpis {
  active_locations: number;
  unpaid_invoice_count: number;
  total_invoice_count: number;
  outstanding_dues_total: number;
  dues_location_count: number;
  open_estimate_count: number;
  total_estimate_count: number;
  top_location_name: string | null;
  top_location_gmv_share_pct: number;
}

export interface LocationsLandingRow {
  id: string;
  name: string;
  city: string;
  address_text: string;
  phone_number: string | null;
  initials: string;
  gmv_mtd: number;
  gmv_prev: number;
  growth_pct: number;
  active_buyers: number;
  outstanding_dues: number;
  sku_count: number;
  oos_sku_count: number;
  low_stock_sku_count: number;
  stock_status: LocationStockStatus;
  oldest_unpaid_days: number | null;
  is_active: boolean;
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
  kpis: LocationsLandingKpis;
  callouts: {
    conversions: LocationsCalloutRow[];
    top_locations: LocationsCalloutRow[];
    collections_overdue: LocationsCalloutRow[];
  };
  locations: LocationsLandingRow[];
  total: number;
  limit?: number;
  offset?: number;
  nextOffset?: number | null;
  period: string;
  refreshed_at: string;
}

export interface LocationsLandingFilters {
  search?: string;
  status?: string[];
  stock?: string[];
  dues?: string[];
}

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
  meta_strip: {
    gmv_mtd: number;
    growth_pct: number;
    outstanding_dues: number;
    invoice_count: number;
    unpaid_invoice_count: number;
    total_invoice_count: number;
    open_estimate_count: number;
    total_estimate_count: number;
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
  const hasFilters = Boolean(filters.search?.trim() || filters.status?.length || filters.stock?.length || filters.dues?.length);
  const baseSummary = initialData?.period === period ? initialData : null;

  const query = useInfiniteQuery<LocationsLandingResponse>({
    queryKey: ['locations-landing', currentTenantId, period, filters],
    enabled: Boolean(currentTenantId),
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ period, limit: '50', offset: String(pageParam), include_summary: String(pageParam === 0 && !hasFilters) });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'stock', filters.stock);
      appendArrayParam(params, 'dues', filters.dues);
      const res = await fetch(`/api/tenant/locations/landing?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`locations-landing ${res.status}`);
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialData: baseSummary ? { pages: [baseSummary], pageParams: [0] } : undefined,
    initialDataUpdatedAt: baseSummary ? 0 : undefined,
    placeholderData: keepPreviousData,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'locations');
  const data = merged && baseSummary ? { ...baseSummary, ...merged } : merged;
  const retained = useRetainedValue(data);
  return { ...query, data: data ?? retained };
}

export function useLocationDetail(id: string) {
  const { currentTenantId } = useAuth();

  return useQuery<LocationDetailResponse>({
    queryKey: ['location-detail', currentTenantId, id],
    enabled: Boolean(currentTenantId) && Boolean(id),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/tenant/locations/${id}/detail`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error(`location-detail ${res.status}`);
      return res.json() as Promise<LocationDetailResponse>;
    },
  });
}
