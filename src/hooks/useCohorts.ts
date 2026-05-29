'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export type CohortType = 'Geo-based' | 'Tier-based' | 'Brand affinity';

export interface CohortsLandingKpis {
  total_cohorts: number;
  covered_members: number;
  total_buyers: number;
  combined_gmv_mtd: number;
  growth_pct: number;
  avg_conversion_pct: number;
  uncategorised_buyers: number;
}

export interface CohortsLandingCalloutRow {
  id: string;
  name: string;
  type: CohortType;
  conversion_pct: number;
  active_members: number;
  total_members: number;
  gmv_mtd: number;
  aov: number;
  growth_pct: number;
  live_catalogs_count: number;
}

export interface CohortsLandingRow {
  id: string;
  name: string;
  description: string | null;
  type: CohortType;
  focus_chips: string[];
  gmv_mtd: number;
  growth_pct: number;
  active_members: number;
  total_members: number;
  conversion_pct: number;
  live_catalogs_count: number;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface CohortsLandingResponse {
  kpis: CohortsLandingKpis;
  todays_read: {
    low_conversion: CohortsLandingCalloutRow[];
    top_performers: CohortsLandingCalloutRow[];
    top_risers: CohortsLandingCalloutRow[];
  };
  cohorts: CohortsLandingRow[];
  period: {
    timezone: string;
    current_month_start: string;
    current_month_end_exclusive: string;
    previous_mtd_start: string;
    previous_mtd_end_exclusive: string;
  };
}

export function useCohortsLanding() {
  return useQuery({
    queryKey: ['cohorts-landing'],
    queryFn: async (): Promise<CohortsLandingResponse> => {
      const res = await apiFetch('/api/cohorts?view=landing');
      if (!res.ok) {
        throw new Error('Failed to fetch cohorts landing');
      }
      return res.json();
    },
  });
}

