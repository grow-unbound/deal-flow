'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  confirmed_at: string | null;
  dispatched_at: string | null;
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
  open_value: number;
  open_total: number;
}

export interface OrdersPulseAggregates {
  waiting_confirmation_count: number;
  waiting_confirmation_value: number;
  waiting_dispatch_count: number;
  waiting_dispatch_value: number;
}

export interface OrdersTodaysRead {
  needs_attention: OrderLandingRow[];
  to_dispatch: OrderLandingRow[];
  stock_shortage: OrderLandingRow[];
}

export interface TenantOrdersResponse {
  period: SellerLandingPeriodMeta;
  kpis?: OrdersKpis;
  pulse_aggregates?: OrdersPulseAggregates;
  todays_read?: OrdersTodaysRead;
  orders: OrderLandingRow[];
  filters?: LandingFilterMeta;
}

export interface OrdersLandingKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface OrdersLandingMetricsV4 {
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
  cards: OrdersLandingKpiCardV4[];
}

export interface TenantOrdersFilters {
  search?: string;
  source?: string[];
  status?: string[];
  location_id?: string[];
  attention?: string[];
  filter_preset?: Record<string, unknown> | null;
}

export interface TenantOrdersPage extends TenantOrdersResponse {
  nextCursor: string | null;
  total: number | null;
}

function getInitialOrdersMetrics(period: SellerLandingPeriod, initialData?: OrdersLandingMetricsV4 | null) {
  const expectedPeriodKey = period === 'today'
    ? 'today'
    : period === 'week'
      ? 'this_week'
      : period === 'quarter'
        ? 'this_quarter'
        : 'this_month';
  return initialData?.period?.period_key === expectedPeriodKey ? initialData : undefined;
}

export function useTenantOrdersMetrics(period: SellerLandingPeriod = 'month', initialData?: OrdersLandingMetricsV4 | null) {
  return useQuery({
    queryKey: ['tenant-orders-metrics-v4', period],
    queryFn: async (): Promise<OrdersLandingMetricsV4> => {
      const res = await apiFetch(`/api/tenant/orders/metrics?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch order metrics');
      return res.json();
    },
    initialData: getInitialOrdersMetrics(period, initialData),
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
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
    (filters.location_id?.length ?? 0) > 0 ||
    (filters.attention?.length ?? 0) > 0 ||
    Boolean(filters.filter_preset && Object.keys(filters.filter_preset).length > 0);
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;
  return useQuery({
    queryKey: ['tenant-orders', period, { ...filters, filter_preset: presetKey }],
    queryFn: async (): Promise<TenantOrdersResponse> => {
      const params = new URLSearchParams({ period });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'source', filters.source);
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'location_id', filters.location_id);
      appendArrayParam(params, 'attention', filters.attention);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
      const res = await apiFetch(`/api/tenant/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    initialData: hasActiveFilters ? undefined : getSellerLandingInitialData(period, initialData),
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useTenantOrdersInfinite(
  period: SellerLandingPeriod = 'month',
  filters: TenantOrdersFilters = {},
) {
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;
  return useInfiniteQuery({
    queryKey: ['tenant-orders-infinite', period, { ...filters, filter_preset: presetKey }],
    queryFn: async ({ pageParam }): Promise<TenantOrdersPage> => {
      const params = new URLSearchParams({ period });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'source', filters.source);
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'location_id', filters.location_id);
      appendArrayParam(params, 'attention', filters.attention);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
      const res = await apiFetch(`/api/tenant/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
