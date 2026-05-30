'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import type { CohortUpdateInput } from '@/lib/zod';

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

export interface CohortDetailHeader {
  id: string;
  cohort_name: string;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral';
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
  subtitle: {
    members_text: string;
    description_text: string;
    created_by_text: string;
  };
}

export interface CohortDetailMetaStrip4 {
  gmv_mtd: number;
  growth_pct: number;
  active_members: number;
  total_members: number;
  aov: number;
  conversion_pct: number;
}

export interface CohortDetailMemberPreview {
  id: string;
  name: string;
  city: string;
  tier: string;
}

export interface CohortDetailDetailsRules {
  id: string;
  name: string;
  description: string;
  type: string;
  is_static: boolean;
  rules: {
    filters: Array<{ field: string; operator: string; value: string | string[] }>;
  };
  members_preview: CohortDetailMemberPreview[];
  updated_at: string;
}

export interface CohortDetailPerformance {
  summary: {
    gmv_mtd: number;
    growth_pct: number;
    aov: number;
  };
  engagement: {
    active_members: number;
    total_members: number;
    dormant_members: number;
    conversion_pct: number;
    brands_sold: number;
    brands_carried: number;
  };
  top_members: Array<{
    buyer_id: string;
    buyer_name: string;
    city: string;
    initials: string;
    spend_mtd: number;
    order_count_mtd: number;
  }>;
  catalogs: Array<{
    catalog_id: string;
    catalog_name: string;
    sent_at: string;
    opens: number;
    orders: number;
    gmv: number;
  }>;
  gmv_trend_12m: Array<{ month: string; value: number }>;
}

export interface CohortDetailActivityItem {
  id: string;
  at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  diff: Record<string, unknown> | null;
}

export interface CohortDetailResponse {
  header: CohortDetailHeader;
  meta_strip_4: CohortDetailMetaStrip4;
  details_rules: CohortDetailDetailsRules;
  performance: CohortDetailPerformance;
  activity: CohortDetailActivityItem[];
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

export function useCohortDetail(id: string) {
  return useQuery({
    queryKey: ['cohort-detail', id],
    queryFn: async (): Promise<CohortDetailResponse> => {
      const res = await apiFetch(`/api/cohorts/${id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch cohort detail');
      }
      return res.json();
    },
    enabled: Boolean(id),
  });
}

export function useUpdateCohortDetail(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CohortUpdateInput) => {
      const res = await apiFetch(`/api/cohorts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to update cohort');
      }

      return res.json() as Promise<{ cohort: { updated_at: string } }>;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['cohort-detail', id], ['cohorts-landing']]);

      queryClient.setQueryData<CohortDetailResponse>(['cohort-detail', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          header: {
            ...old.header,
            cohort_name: payload.name ?? old.header.cohort_name,
            subtitle: {
              ...old.header.subtitle,
              description_text:
                payload.description !== undefined
                  ? payload.description.length > 56
                    ? `${payload.description.slice(0, 56)}…`
                    : payload.description
                  : old.header.subtitle.description_text,
            },
          },
          details_rules: {
            ...old.details_rules,
            name: payload.name ?? old.details_rules.name,
            description: payload.description ?? old.details_rules.description,
            rules:
              payload.rules && Array.isArray(payload.rules.filters)
                ? {
                    filters: payload.rules.filters.map((f) => ({
                      field: f.field,
                      operator: f.operator,
                      value: f.value,
                    })),
                  }
                : old.details_rules.rules,
          },
        };
      });

      queryClient.setQueryData<CohortsLandingResponse>(['cohorts-landing'], (old) => {
        if (!old) return old;
        return {
          ...old,
          cohorts: old.cohorts.map((cohort) =>
            cohort.id === id
              ? {
                  ...cohort,
                  name: payload.name ?? cohort.name,
                  description: payload.description ?? cohort.description,
                }
              : cohort,
          ),
        };
      });

      return { snapshots };
    },
    onError: (_error, _payload, ctx) => rollbackSnapshots(queryClient, ctx?.snapshots),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
    },
  });
}

export function useArchiveCohortDetail(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/cohorts/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to archive cohort');
      }

      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', id] });
    },
  });
}
