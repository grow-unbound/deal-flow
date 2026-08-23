'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod } from '@/lib/seller-period';
import type {
  SellerDashboardBusinessFlowV4,
  SellerDashboardCustomerActivityV4,
  SellerDashboardLocationPerformanceV4,
  SellerDashboardMetricsV4,
  SellerDashboardResponse,
  SellerDashboardSalesMixDimension,
  SellerDashboardSalesMixV4,
} from '@/types/seller-dashboard';

export function useSellerDashboard(
  period: SellerLandingPeriod,
  initialData?: SellerDashboardResponse | null,
) {
  return useQuery({
    queryKey: ['seller-dashboard', period],
    queryFn: async (): Promise<SellerDashboardResponse> => {
      const response = await apiFetch(`/api/tenant/dashboard?period=${period}`);
      if (!response.ok) {
        throw new Error('Failed to fetch seller dashboard');
      }
      return response.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSellerDashboardMetrics(
  period: SellerLandingPeriod,
  initialData?: SellerDashboardMetricsV4 | null,
) {
  return useQuery({
    queryKey: ['seller-dashboard-metrics', period],
    queryFn: async (): Promise<SellerDashboardMetricsV4> => {
      const response = await apiFetch(`/api/tenant/dashboard/metrics?period=${period}`);
      if (!response.ok) {
        throw new Error('Failed to fetch seller dashboard metrics');
      }
      return response.json();
    },
    initialData: initialData ?? undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

// The 4 seller-admin dashboard cards below are each fetched independently
// (own route, own query key) so a slow card never blocks the others -- same
// principle as splitting the KPI strip into its own /metrics route above.

export function useSellerDashboardBusinessFlow() {
  return useQuery({
    queryKey: ['seller-dashboard-business-flow'],
    queryFn: async (): Promise<SellerDashboardBusinessFlowV4> => {
      const response = await apiFetch('/api/tenant/dashboard/business-flow');
      if (!response.ok) throw new Error('Failed to fetch business flow');
      return response.json();
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSellerDashboardCustomerActivity() {
  return useQuery({
    queryKey: ['seller-dashboard-customer-activity'],
    queryFn: async (): Promise<SellerDashboardCustomerActivityV4> => {
      const response = await apiFetch('/api/tenant/dashboard/customer-activity');
      if (!response.ok) throw new Error('Failed to fetch customer activity');
      return response.json();
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

async function fetchSalesMix(dimension: SellerDashboardSalesMixDimension): Promise<SellerDashboardSalesMixV4> {
  const response = await apiFetch(`/api/tenant/dashboard/sales-mix?dimension=${dimension}`);
  if (!response.ok) throw new Error('Failed to fetch sales mix');
  return response.json();
}

const OTHER_SALES_MIX_DIMENSION: Record<SellerDashboardSalesMixDimension, SellerDashboardSalesMixDimension> = {
  brands: 'categories',
  categories: 'brands',
};

/** Fetches only `dimension` on mount/change; once it settles, prefetches the
 *  other dimension in the background so toggling feels instant without
 *  costing anything on first paint (brand/category are independent
 *  GROUP BY queries over two different tables -- eagerly fetching both
 *  would double query cost for data half of which isn't shown by default). */
export function useSellerDashboardSalesMix(dimension: SellerDashboardSalesMixDimension) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['seller-dashboard-sales-mix', dimension],
    queryFn: () => fetchSalesMix(dimension),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });

  useEffect(() => {
    if (!query.isSuccess) return;
    const other = OTHER_SALES_MIX_DIMENSION[dimension];
    void queryClient.prefetchQuery({
      queryKey: ['seller-dashboard-sales-mix', other],
      queryFn: () => fetchSalesMix(other),
      staleTime: NAVIGATION_QUERY_STALE_TIME,
    });
  }, [dimension, query.isSuccess, queryClient]);

  return query;
}

export function useSellerDashboardLocationPerformance() {
  return useQuery({
    queryKey: ['seller-dashboard-location-performance'],
    queryFn: async (): Promise<SellerDashboardLocationPerformanceV4> => {
      const response = await apiFetch('/api/tenant/dashboard/location-performance');
      if (!response.ok) throw new Error('Failed to fetch location performance');
      return response.json();
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
