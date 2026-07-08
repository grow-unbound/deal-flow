'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { CohortCreateInput, CohortRules, CohortUpdateInput } from '@/lib/zod';
import { buildCohortRulesSummary, type CohortRulesSummary } from '@/lib/cohort-rules-summary';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';

export type { CohortRulesSummary };

export type CohortType = 'Geo-based' | 'Activity-based' | 'Brand affinity';

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
  is_static?: boolean;
  type: CohortType;
  focus_chips: string[];
  allowed_brands_count: number | null;
  allowed_brands_label: string;
  allowed_tenant_brand_ids?: string[] | null;
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
  brands: Array<{
    id: string;
    name: string;
  }>;
  period: SellerLandingPeriodMeta;
}

export interface CohortsLandingFilters {
  search?: string;
  brands?: string[];
}

export interface TenantCohortOption {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
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

export interface CohortDetailBuyer {
  buyer_id: string;
  business_name: string;
  contact_name: string | null;
  external_ref: string | null;
  geography_label: string;
  tier: 'A' | 'B' | 'C' | null;
  mtd_spend: number;
  orders_mtd: number;
  aov: number;
  credit_used: number;
  last_order_at: string | null;
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
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
  allowed_tenant_brand_ids?: string[] | null;
  allowed_brand_names?: string[];
  rules: {
    filters: Array<{ field: string; operator: string; value: string | string[] }>;
  };
  members_preview: CohortDetailMemberPreview[];
  updated_at: string;
  last_refreshed_at: string | null;
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
    campaign_id: string;
    catalog_name: string;
    sent_at: string;
    opens: number;
    orders: number;
    gmv: number;
  }>;
  gmv_trend_12m: Array<{ month: string; value: number }>;
}

export interface CohortDetailResponse {
  header: CohortDetailHeader;
  meta_strip_4: CohortDetailMetaStrip4;
  details_rules: CohortDetailDetailsRules;
  performance: CohortDetailPerformance;
  buyers: CohortDetailBuyer[];
  rules_summary: CohortRulesSummary;
}

export interface CohortComposerFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface CohortComposerBuyer {
  id: string;
  business_name: string;
  contact_name: string | null;
  external_ref: string | null;
  geography_label: string;
  city: string | null;
  state: string | null;
  tier: 'A' | 'B' | 'C' | null;
  last_order_at: string | null;
  mtd_spend: number;
  orders_mtd: number;
  credit_used: number;
  payment_terms_days: number;
  gmv_90d: number;
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
}

export interface CohortComposerResponse {
  buyers: CohortComposerBuyer[];
  brands: Array<{
    id: string;
    label: string;
  }>;
  filters: {
    geographies: CohortComposerFilterOption[];
    tiers: CohortComposerFilterOption[];
    last_order_buckets: CohortComposerFilterOption[];
    gmv_90d_buckets: CohortComposerFilterOption[];
  };
}

export interface CohortMembersResponse {
  members: Array<{
    buyer_id: string;
    buyers: {
      id: string;
      business_name: string;
      tier: string | null;
      is_active: boolean;
    };
  }>;
}

export function useCohortsLanding(
  period: SellerLandingPeriod = 'month',
  filters: CohortsLandingFilters = {},
  initialData?: CohortsLandingResponse | null,
) {
  return useQuery({
    queryKey: ['cohorts-landing', period, filters],
    queryFn: async (): Promise<CohortsLandingResponse> => {
      const params = new URLSearchParams({ period });
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'brands', filters.brands);
      const res = await apiFetch(`/api/tenant/cohorts?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch cohorts landing');
      }
      return res.json();
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useTenantCohortOptions(enabled = true) {
  return useQuery({
    queryKey: ['tenant-cohort-options'],
    queryFn: async (): Promise<TenantCohortOption[]> => {
      const res = await apiFetch('/api/tenant/cohorts');
      if (res.status === 403) return [];
      if (!res.ok) {
        throw new Error('Failed to fetch cohorts');
      }
      const data = (await res.json()) as CohortsLandingResponse;
      return data.cohorts.map((cohort) => ({
        id: cohort.id,
        name: cohort.name,
        description: cohort.description,
        member_count: cohort.total_members,
      }));
    },
    enabled,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
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
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCohortComposerData() {
  return useQuery({
    queryKey: ['cohort-composer-data'],
    queryFn: async (): Promise<CohortComposerResponse> => {
      const res = await apiFetch('/api/cohorts/composer');
      if (!res.ok) {
        throw new Error('Failed to fetch cohort composer data');
      }
      return res.json();
    },
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useCohortMembers(id: string) {
  return useQuery({
    queryKey: ['cohort-members', id],
    queryFn: async (): Promise<CohortMembersResponse> => {
      const res = await apiFetch(`/api/cohorts/${id}/members`);
      if (!res.ok) {
        throw new Error('Failed to fetch cohort members');
      }
      return res.json();
    },
    enabled: Boolean(id),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useSaveCohortComposer(cohortId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CohortCreateInput) => {
      const res = await apiFetch(cohortId ? `/api/cohorts/${cohortId}` : '/api/cohorts', {
        method: cohortId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save cohort');
      }

      return res.json() as Promise<{
        cohort: {
          id: string;
          name: string;
          description: string | null;
          is_static: boolean;
          rules: CohortRules | null;
          cached_member_count: number | null;
        };
      }>;
    },
    onSuccess: (_result, payload) => {
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      queryClient.invalidateQueries({ queryKey: ['cohort-composer-data'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-cohort-options'] });
      if (cohortId) {
        queryClient.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
        queryClient.invalidateQueries({ queryKey: ['cohort-members', cohortId] });
      }

      if (cohortId) {
        queryClient.setQueryData<CohortDetailResponse>(['cohort-detail', cohortId], (old) => {
          if (!old) return old;
          return {
            ...old,
            header: {
              ...old.header,
              cohort_name: payload.name,
              status_label: 'Active',
              status_tone: 'success',
              subtitle: {
                ...old.header.subtitle,
                description_text: payload.description ?? old.header.subtitle.description_text,
              },
            },
            details_rules: {
              ...old.details_rules,
              name: payload.name,
              description: payload.description ?? '',
              is_static: payload.is_static,
              allowed_tenant_brand_ids: payload.allowed_tenant_brand_ids ?? null,
              type: payload.is_static ? 'Static list' : 'Rule-based',
              rules: payload.rules ?? { filters: [] },
            },
            rules_summary: buildCohortRulesSummary({
              is_static: payload.is_static,
              filters: payload.rules?.filters ?? [],
              member_count: old.rules_summary.member_count,
              total_tenant_buyers: old.rules_summary.total_tenant_buyers,
              allowed_brand_names: old.details_rules.allowed_brand_names,
            }),
          };
        });
      }
      toast.success(cohortId ? 'Cohort saved' : 'Cohort created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save cohort');
    },
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
            status_label: 'Active',
            status_tone: 'success',
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
            is_static: payload.is_static ?? old.details_rules.is_static,
            allowed_tenant_brand_ids:
              payload.allowed_tenant_brand_ids === undefined
                ? old.details_rules.allowed_tenant_brand_ids
                : payload.allowed_tenant_brand_ids,
            type:
              payload.is_static !== undefined
                ? payload.is_static
                  ? 'Static list'
                  : 'Rule-based'
                : old.details_rules.type,
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
          rules_summary: buildCohortRulesSummary({
            is_static: payload.is_static ?? old.details_rules.is_static,
            filters:
              payload.rules && Array.isArray(payload.rules.filters)
                ? payload.rules.filters.map((f) => ({
                    field: f.field,
                    operator: f.operator,
                    value: f.value,
                  }))
                : old.details_rules.rules.filters,
            member_count: old.rules_summary.member_count,
            total_tenant_buyers: old.rules_summary.total_tenant_buyers,
            allowed_brand_names: old.details_rules.allowed_brand_names,
          }),
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
    onError: (error, _payload, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Could not update cohort');
    },
    onSuccess: () => {
      toast.success('Cohort updated');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
    },
  });
}

export function useRefreshCohort(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/cohorts/${id}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Refresh failed');
      }
      return res.json() as Promise<{
        ok: boolean;
        cached_member_count: number | null;
        last_refreshed_at: string | null;
      }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<CohortDetailResponse>(['cohort-detail', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          details_rules: {
            ...old.details_rules,
            last_refreshed_at: result.last_refreshed_at,
          },
          meta_strip_4: {
            ...old.meta_strip_4,
            total_members: result.cached_member_count ?? old.meta_strip_4.total_members,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['cohort-members', id] });
      toast.success('Membership refreshed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not refresh cohort');
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
      toast.success('Cohort archived');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not archive cohort');
    },
  });
}
