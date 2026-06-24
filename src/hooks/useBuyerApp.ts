'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';

export interface BuyerAppCalloutBuyer {
  buyer_id: string;
  name: string;
  initials: string;
  enabled_date?: string;
  days_inactive?: number;
  gmv?: number;
  orders?: number;
  offline_gmv?: number;
}

export interface BuyerAppLocation {
  location_id: string;
  name: string;
  app_orders: number;
  app_gmv: number;
  share_pct: number | null;
}

export interface BuyerAppTopBuyer {
  buyer_id: string;
  name: string;
  initials: string;
  city: string;
  gmv: number;
  orders: number;
}

export interface BuyerAppLandingResponse {
  period: SellerLandingPeriodMeta;
  kpis: {
    enabled_buyers: number;
    total_buyers: number;
    app_gmv: number;
    app_orders: number;
    active_buyers: number;
    app_estimates_value: number;
    app_estimates_count: number;
    converted_to_order_value: number;
    converted_to_order_count: number;
    invoiced_value: number;
    invoiced_count: number;
  };
  snapshot: {
    enabled_buyers: number;
    total_buyers: number;
    opened_app_mtd: number;
    ordered_mtd: number;
    repeat_mtd: number;
    app_gmv_mtd: number;
    app_orders_mtd: number;
    total_gmv_mtd: number;
    estimates_app_value_mtd: number;
    estimates_app_count_mtd: number;
    converted_order_value_mtd: number;
    converted_order_count_mtd: number;
    invoiced_app_value_mtd: number;
    invoiced_app_count_mtd: number;
    not_ordering_buyers: BuyerAppCalloutBuyer[];
    top_app_buyers_callout: BuyerAppCalloutBuyer[];
    no_app_buyers: BuyerAppCalloutBuyer[];
    top_app_buyers_card: BuyerAppTopBuyer[];
    top_locations: BuyerAppLocation[];
    refreshed_at: string;
  } | null;
}

export function useBuyerAppLanding(
  period: SellerLandingPeriod,
  initialData?: BuyerAppLandingResponse | null,
) {
  return useQuery<BuyerAppLandingResponse>({
    queryKey: ['buyer-app-landing', period],
    queryFn: async () => {
      const res = await apiFetch(`/api/tenant/buyer-app?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch buyer app data');
      return res.json() as Promise<BuyerAppLandingResponse>;
    },
    initialData: getSellerLandingInitialData(period, initialData ?? undefined),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
