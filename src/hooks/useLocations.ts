import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import type { SellerLandingPeriod } from '@/lib/seller-period';

// ─── Shared ───────────────────────────────────────────────────────────────────

export type LocationStockStatus = 'clear' | 'low_stock' | 'out_of_stock';

// ─── Landing page types ───────────────────────────────────────────────────────

export interface LocationsLandingKpis {
  active_locations: number;
  total_locations: number;
  outstanding_dues_total: number;
  dues_location_count: number;
  low_stock_locations: number;
  top_location_name: string | null;
  top_location_gmv_share_pct: number;
}

export interface LocationsLandingRow {
  id: string;
  name: string;
  type: string;
  city: string;
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
  // stock critical
  critical_sku_count?: number;
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
    stock_critical: LocationsCalloutRow[];
    top_locations: LocationsCalloutRow[];
    collections_overdue: LocationsCalloutRow[];
  };
  locations: LocationsLandingRow[];
  period: string;
  refreshed_at: string;
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

export interface LocationDetailCustomer {
  buyer_id: string;
  business_name: string;
  city: string;
  initials: string;
  spend_mtd: number;
  orders_mtd: number;
  outstanding_dues: number;
  last_order_at: string | null;
}

export interface LocationDetailOrder {
  order_id: string;
  order_number: string;
  placed_at: string;
  buyer_name: string;
  items_count: number;
  total_amount: number;
  status: string;
}

export interface LocationDetailInventoryItem {
  tenant_product_id: string;
  product_name: string;
  brand_name: string;
  qty_available: number;
  days_cover: number | null;
  last_updated: string;
  stock_status: LocationStockStatus;
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
  type: string;
  city: string;
  initials: string;
  is_active: boolean;
  meta_strip: {
    gmv_mtd: number;
    growth_pct: number;
    active_buyers: number;
    total_buyers: number;
    outstanding_dues: number;
    invoice_count: number;
    low_stock_skus: number;
  };
  overview: {
    gmv_trend: LocationDetailGmvWeek[];
    inventory_health: LocationDetailInventoryHealth;
    top_buyers: LocationDetailTopBuyer[];
  };
  customers: LocationDetailCustomer[];
  orders: LocationDetailOrder[];
  inventory: LocationDetailInventoryItem[];
  activity: LocationDetailActivityItem[];
  tab_badges: {
    customers: number;
    orders_mtd: number;
    low_stock_skus: number;
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLocationsLanding(
  period: SellerLandingPeriod,
  initialData: LocationsLandingResponse | null,
) {
  const { currentTenantId } = useAuth();

  const query = useQuery<LocationsLandingResponse>({
    queryKey: ['locations-landing', currentTenantId, period],
    enabled: Boolean(currentTenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/tenant/locations/landing?period=${period}`);
      if (!res.ok) throw new Error(`locations-landing ${res.status}`);
      return res.json() as Promise<LocationsLandingResponse>;
    },
    initialData: initialData ?? undefined,
  });

  const retained = useRetainedValue(query.data);
  return { ...query, data: query.data ?? retained };
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
