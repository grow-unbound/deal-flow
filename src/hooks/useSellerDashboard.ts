'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod } from '@/lib/seller-period';
import type { SellerDashboardResponse } from '@/types/seller-dashboard';

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
