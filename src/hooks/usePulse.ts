'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { PulseContributionResponse, PulseOpportunitiesResponse } from '@/types/pulse';

export function usePulseContribution() {
  return useQuery<PulseContributionResponse>({
    queryKey: ['pulse', 'contribution'],
    queryFn: async () => {
      const response = await apiFetch('/api/tenant/pulse/contribution');
      if (!response.ok) throw new Error('Failed to load Pulse contribution');
      return response.json() as Promise<PulseContributionResponse>;
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function usePulseOpportunities() {
  return useQuery<PulseOpportunitiesResponse>({
    queryKey: ['pulse', 'opportunities'],
    queryFn: async () => {
      const response = await apiFetch('/api/tenant/pulse/opportunities');
      if (!response.ok) throw new Error('Failed to load Pulse opportunities');
      return response.json() as Promise<PulseOpportunitiesResponse>;
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
