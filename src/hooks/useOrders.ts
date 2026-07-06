'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import type { LandingFilterMeta } from '@/lib/landing-filter-params';

export type OrderStatusValue =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'partially_dispatched'
  | 'dispatched'
  | 'delivered'
  | 'invoiced'
  | 'partially_invoiced'
  | 'cancelled';
export type OrderStatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type OrderAvatarHue = 'teal' | 'ember' | 'cream';

export interface OrderLandingRow {
  id: string;
  location_id: string | null;
  location_name: string | null;
  order_id: string;
  buyer_id: string;
  buyer_name: string;
  place_of_supply: string | null;
  buyer_city: string | null;
  buyer_state: string | null;
  buyer_initials: string;
  buyer_hue: OrderAvatarHue;
  delivery_city: string;
  delivery_label: string;
  source: string | null;
  source_kind: 'buyer_app' | 'converted' | 'direct';
  source_label: string;
  source_detail: string;
  campaign_name: string | null;
  catalog_name: string | null;
  items_count: number;
  gmv: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: {
    value: OrderStatusValue;
    label: string;
    tone: OrderStatusTone;
    filter_chip: 'All' | 'Received' | 'Confirmed' | 'In transit' | 'Invoiced' | 'Delivered' | 'Cancelled';
  };
  placed_at: string;
}

export interface OrdersKpis {
  orders_mtd: number;
  orders_prev_mtd: number;
  orders_growth_pct: number;
  gmv_mtd: number;
  gmv_prev_mtd: number;
  aov: number;
  pending_dispatch_count: number;
  received_count: number;
  delivered_count: number;
  buyers_mtd: number;
}

export interface OrdersTodaysRead {
  needs_attention: OrderLandingRow[];
  biggest_tickets: OrderLandingRow[];
  in_motion: OrderLandingRow[];
}

export interface TenantOrdersResponse {
  period: SellerLandingPeriodMeta;
  kpis: OrdersKpis;
  todays_read: OrdersTodaysRead;
  orders: OrderLandingRow[];
  filters?: LandingFilterMeta;
}

export interface TenantOrdersFilters {
  search?: string;
  source?: string[];
  status?: string[];
  location_id?: string[];
}

export function useTenantOrders(
  period: SellerLandingPeriod = 'month',
  filters: TenantOrdersFilters = {},
  initialData?: TenantOrdersResponse | null,
) {
  const hasActiveFilters =
    Boolean(filters.search?.trim()) ||
    (filters.source?.length ?? 0) > 0 ||
    (filters.status?.length ?? 0) > 0 ||
    (filters.location_id?.length ?? 0) > 0;
  return useQuery({
    queryKey: ['tenant-orders', period, filters],
    queryFn: async (): Promise<TenantOrdersResponse> => {
      const params = new URLSearchParams({ period });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'source', filters.source);
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'location_id', filters.location_id);
      // #region agent log
      fetch('http://127.0.0.1:7499/ingest/42159701-4a5a-4229-9bc0-a9348f871657', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '56e5c0' },
        body: JSON.stringify({
          sessionId: '56e5c0',
          runId: 'pre-fix',
          hypothesisId: 'D-client-fetch',
          location: 'src/hooks/useOrders.ts:queryFn',
          message: 'client orders API fetch triggered',
          data: { period, hasActiveFilters, params: params.toString() },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const res = await apiFetch(`/api/tenant/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    initialData: hasActiveFilters ? undefined : getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
