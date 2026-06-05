'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';

export type OrderStatusValue = 'draft' | 'received' | 'confirmed' | 'partially_dispatched' | 'dispatched' | 'delivered' | 'cancelled';
export type OrderStatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type OrderAvatarHue = 'teal' | 'ember' | 'cream';

export interface OrderLandingRow {
  id: string;
  order_id: string;
  buyer_id: string;
  buyer_name: string;
  buyer_initials: string;
  buyer_hue: OrderAvatarHue;
  delivery_city: string;
  delivery_label: string;
  items_count: number;
  gmv: number;
  status: {
    value: OrderStatusValue;
    label: string;
    tone: OrderStatusTone;
    filter_chip: 'All' | 'Confirmed' | 'In transit' | 'Delivered' | 'Hold' | 'Cancelled';
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
  on_hold_count: number;
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
}

export function useTenantOrders(period: SellerLandingPeriod = 'month', initialData?: TenantOrdersResponse | null) {
  return useQuery({
    queryKey: ['tenant-orders', period],
    queryFn: async (): Promise<TenantOrdersResponse> => {
      const res = await apiFetch(`/api/tenant/orders?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSyncToTally() {
  return useMutation({
    mutationFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
      return { ok: true };
    },
  });
}
