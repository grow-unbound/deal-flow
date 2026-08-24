'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
import { rollbackSnapshots, takeSnapshots } from '@/lib/optimistic';
import { REFERENCE_QUERY_GC_TIME, REFERENCE_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type { CohortCreateInput, CohortRules, CohortUpdateInput, CustomerGroupFormPayload } from '@/lib/zod';
import { buildCohortRulesSummary, type CohortRulesSummary } from '@/lib/cohort-rules-summary';
import { getSellerLandingInitialData, type SellerLandingPeriod, type SellerLandingPeriodMeta } from '@/lib/seller-period';
import { mergeSellerLandingPages } from '@/lib/merge-seller-landing-pages';

export type { CohortRulesSummary };

export type CohortType = 'Geo-based' | 'Activity-based' | 'Brand affinity';

export interface CohortsLandingKpis {
  total_cohorts: number;
  covered_members: number;
  total_buyers: number;
  combined_gmv_mtd: number;
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
  active_members: number;
  total_members: number;
  conversion_pct: number;
  live_catalogs_count: number;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral';
}

export interface CohortsLandingResponse {
  total?: number;
  limit?: number;
  nextCursor?: string | null;
  kpis: CohortsLandingKpis;
  todays_read: {
    low_conversion: CohortsLandingCalloutRow[];
    top_performers: CohortsLandingCalloutRow[];
  };
  cohorts: CohortsLandingRow[];
  brands: Array<{
    id: string;
    name: string;
  }>;
  period: SellerLandingPeriodMeta;
}

export interface CohortsLandingKpiCardV4 {
  id: string;
  value: number;
  entity_count?: number;
  document_count?: number | null;
  secondary_value?: number | null;
  time_basis?: string;
  filter_preset?: Record<string, unknown>;
}

export interface CohortsLandingMetricsV4 {
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
  cards: CohortsLandingKpiCardV4[];
}

export interface CohortsLandingFilters {
  search?: string;
  brands?: string[];
  status?: string[];
  filter_preset?: Record<string, unknown> | null;
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

/** Quarter-to-date KPI strip, sourced from metrics_cohort_period_summary (grain='quarter'). */
export interface CohortDetailMetaStrip4 {
  active_member_count: number;
  member_count: number;
  sales_qtd_value: number;
  sales_qtd_count: number;
  demand_qtd_value: number;
  demand_qtd_count: number;
  /** null = no brand restriction ("All brands"). */
  brands_count: number | null;
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
}

export interface CohortDetailResponse {
  header: CohortDetailHeader;
  meta_strip_4: CohortDetailMetaStrip4;
  details_rules: CohortDetailDetailsRules;
  performance: CohortDetailPerformance | null;
  rules_summary: CohortRulesSummary;
}

export interface CohortMemberBuyersResponse {
  buyers: CohortDetailBuyer[];
}

function cohortTypeLabel(brandCount: number): CohortType {
  if (brandCount > 0) return 'Brand affinity';
  return 'Activity-based';
}

function allowedBrandsLabel(brandNames: string[]): string {
  if (brandNames.length === 0) return 'All brands';
  if (brandNames.length <= 3) return brandNames.join(', ');
  return `${brandNames.slice(0, 3).join(', ')} + ${brandNames.length - 3} more`;
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
  buyer_app_enabled?: boolean;
  overdue_amount?: number;
}

export interface CohortComposerResponse {
  buyers: CohortComposerBuyer[];
  total_buyer_count: number;
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

export interface CohortComposerBuyerResultsetResponse {
  buyers: CohortComposerBuyer[];
  selected_buyers: CohortComposerBuyer[];
  total: number;
  nextCursor: string | null;
}

export interface CohortComposerBuyerFilters {
  query?: string;
  geographies?: string[];
  lastOrderBucket?: string;
  gmvBuckets?: string[];
  selectedIds?: string[];
  limit?: number;
  enabled?: boolean;
}

const SELECTED_BUYERS_LIMIT = 250;

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
  const presetKey = filters.filter_preset ? JSON.stringify(filters.filter_preset) : null;
  const hasFilters = Boolean(filters.search?.trim() || filters.brands?.length || filters.status?.length || presetKey);
  const baseSummary = getSellerLandingInitialData(period, initialData);
  const initial = !hasFilters
    ? baseSummary
    : undefined;
  const query = useInfiniteQuery({
    queryKey: ['cohorts-landing', period, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<CohortsLandingResponse> => {
      const params = new URLSearchParams({ period, limit: '50', include_summary: String(!pageParam && !hasFilters) });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'brands', filters.brands);
      appendArrayParam(params, 'status', filters.status);
      if (filters.filter_preset && Object.keys(filters.filter_preset).length > 0) {
        params.set('filter_preset', JSON.stringify(filters.filter_preset));
      }
      const res = await apiFetch(`/api/tenant/cohorts?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch cohorts landing');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: initial ? { pages: [initial], pageParams: [undefined] } : undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    placeholderData: keepPreviousData,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
  });
  const merged = mergeSellerLandingPages(query.data?.pages, 'cohorts');
  return { ...query, data: merged && baseSummary ? { ...baseSummary, ...merged } : merged };
}

export function useCohortsLandingMetrics(initialData?: CohortsLandingMetricsV4 | null) {
  return useQuery({
    queryKey: ['cohorts-landing-metrics'],
    queryFn: async (): Promise<CohortsLandingMetricsV4> => {
      const res = await apiFetch('/api/tenant/cohorts/metrics');
      if (!res.ok) throw new Error('Failed to fetch customer group metrics');
      return res.json();
    },
    initialData: initialData ?? undefined,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
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
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useCohortDetail(id: string, options?: { includePerformance?: boolean }) {
  return useQuery({
    queryKey: ['cohort-detail', id, options?.includePerformance ?? true],
    queryFn: async (): Promise<CohortDetailResponse> => {
      const params = new URLSearchParams();
      params.set('include_performance', String(options?.includePerformance ?? true));
      const res = await apiFetch(`/api/cohorts/${id}?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch customer group detail');
      }
      return res.json();
    },
    enabled: Boolean(id),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCohortMemberBuyers(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cohort-member-buyers', id],
    queryFn: async (): Promise<CohortMemberBuyersResponse> => {
      const res = await apiFetch(`/api/cohorts/${id}/member-buyers`);
      if (!res.ok) {
        throw new Error('Failed to fetch cohort member buyers');
      }
      return res.json();
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCohortComposerData() {
  return useQuery({
    queryKey: ['cohort-composer-data'],
    queryFn: async (): Promise<CohortComposerResponse> => {
      const res = await apiFetch('/api/cohorts/composer');
      if (!res.ok) {
        throw new Error('Failed to fetch customer group composer data');
      }
      return res.json();
    },
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    placeholderData: (previous) => previous,
  });
}

export function useCohortComposerBuyers({
  query,
  geographies = [],
  lastOrderBucket = 'anytime',
  gmvBuckets = [],
  selectedIds = [],
  limit = 50,
  enabled = true,
}: CohortComposerBuyerFilters) {
  return useInfiniteQuery({
    queryKey: ['cohort-composer-buyers', query?.trim() ?? '', geographies, lastOrderBucket, gmvBuckets, selectedIds, limit],
    queryFn: async ({ pageParam, signal }): Promise<CohortComposerBuyerResultsetResponse> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (query?.trim()) params.set('q', query.trim());
      if (lastOrderBucket && lastOrderBucket !== 'anytime') params.set('last_order', lastOrderBucket);
      if (pageParam) params.set('cursor', pageParam as string);
      appendArrayParam(params, 'geography', geographies);
      appendArrayParam(params, 'gmv', gmvBuckets);
      // Hard-capped: never send an unbounded id list (one tenant already has ~11k buyers).
      appendArrayParam(params, 'selected_id', selectedIds.slice(0, SELECTED_BUYERS_LIMIT));
      const res = await apiFetch(`/api/cohorts/composer/buyers?${params.toString()}`, { signal });
      if (!res.ok) {
        throw new Error('Failed to fetch customer group buyers');
      }
      return res.json();
    },
    enabled,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useCohortMembers(id: string) {
  return useQuery({
    queryKey: ['cohort-members', id],
    queryFn: async (): Promise<CohortMembersResponse> => {
      const res = await apiFetch(`/api/cohorts/${id}/members`);
      if (!res.ok) {
        throw new Error('Failed to fetch customer group members');
      }
      return res.json();
    },
    enabled: Boolean(id),
    staleTime: REFERENCE_QUERY_STALE_TIME,
    gcTime: REFERENCE_QUERY_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

type CohortBuyerMembershipRows = InfiniteData<{
  rows: Array<{ buyer_id: string; is_member: boolean }>;
  total: number;
  nextOffset: number | null;
}, number>;

function refreshMembershipFilterQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
) {
  queryClient.removeQueries({ queryKey, type: 'inactive' });
}

function memberFilterKeepsRow(memberFilter: unknown, isMember: boolean) {
  if (memberFilter === 'yes') return isMember;
  if (memberFilter === 'no') return !isMember;
  return true;
}

function detailRowsMemberFilter(queryKey: readonly unknown[]) {
  const params = queryKey[5];
  return params && typeof params === 'object' && 'member' in params
    ? (params as { member?: unknown }).member
    : undefined;
}

function patchCohortMemberCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  cohortId: string,
  buyerIds: string[],
  isMember: boolean,
) {
  const idSet = new Set(buyerIds);
  const delta = isMember ? 1 : -1;

  queryClient.getQueriesData<CohortBuyerMembershipRows>({ queryKey: ['cohort-buyers-detail'] }).forEach(([queryKey, old]) => {
    if (!old) return;
    const memberFilter = detailRowsMemberFilter(queryKey);
    queryClient.setQueryData<CohortBuyerMembershipRows>(queryKey, {
      ...old,
      pages: old.pages.map((page) => {
        let removed = 0;
        const rows = page.rows
          .map((row) => (idSet.has(row.buyer_id) ? { ...row, is_member: isMember } : row))
          .filter((row) => {
            const keep = !idSet.has(row.buyer_id) || memberFilterKeepsRow(memberFilter, row.is_member);
            if (!keep) removed += 1;
            return keep;
          });

        return {
          ...page,
          rows,
          total: Math.max(0, page.total - removed),
        };
      }),
    });
  });

  queryClient.setQueriesData<CohortDetailResponse>(
    { queryKey: ['cohort-detail', cohortId] },
    (old) => {
      if (!old) return old;
      const nextCount = Math.max(0, old.rules_summary.member_count + delta * buyerIds.length);
      return {
        ...old,
        meta_strip_4: {
          ...old.meta_strip_4,
          member_count: nextCount,
        },
        rules_summary: {
          ...old.rules_summary,
          member_count: nextCount,
        },
      };
    },
  );

  queryClient.setQueriesData<InfiniteData<CohortsLandingResponse, number>>(
    { queryKey: ['cohorts-landing'] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          cohorts: page.cohorts.map((cohort) =>
            cohort.id === cohortId
              ? { ...cohort, total_members: Math.max(0, cohort.total_members + delta * buyerIds.length) }
              : cohort,
          ),
        })),
      };
    },
  );
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
        throw new Error((body as { error?: string }).error ?? 'Failed to save customer group');
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
      toast.success(cohortId ? 'Customer group updated' : 'Customer group created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save customer group');
    },
  });
}

export function useSaveSimpleCustomerGroup(cohortId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CustomerGroupFormPayload) => {
      const res = await apiFetch(cohortId ? `/api/cohorts/${cohortId}` : '/api/cohorts', {
        method: cohortId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save customer group');
      }

      return res.json() as Promise<{ cohort: { id: string; name: string; description: string | null } }>;
    },
    onMutate: async (payload) => {
      const keys: (readonly unknown[])[] = [['cohorts-landing']];
      if (cohortId) keys.push(['cohort-detail', cohortId]);
      const snapshots = await takeSnapshots(queryClient, keys);
      const optimisticId = cohortId ?? `optimistic-${Date.now()}`;
      const selectedBrandIds = payload.allowed_tenant_brand_ids ?? [];

      if (cohortId) {
        queryClient.setQueriesData<CohortDetailResponse>({ queryKey: ['cohort-detail', cohortId] }, (old) =>
          old
            ? {
                ...old,
                header: {
                  ...old.header,
                  cohort_name: payload.name,
                  subtitle: {
                    ...old.header.subtitle,
                    description_text: payload.description || 'No description',
                  },
                },
                details_rules: {
                  ...old.details_rules,
                  name: payload.name,
                  description: payload.description || '',
                  allowed_tenant_brand_ids: payload.allowed_tenant_brand_ids ?? null,
                },
              }
            : old,
        );
      }

      queryClient.setQueryData<TenantCohortOption[]>(['tenant-cohort-options'], (old) => {
        const nextOption: TenantCohortOption = {
          id: optimisticId,
          name: payload.name,
          description: payload.description || null,
          member_count: old?.find((option) => option.id === cohortId)?.member_count ?? 0,
        };

        if (!old) {
          return [nextOption];
        }

        if (cohortId) {
          return old.map((option) => (option.id === cohortId ? { ...option, ...nextOption, id: cohortId } : option));
        }

        return [nextOption, ...old];
      });

      queryClient.setQueriesData<InfiniteData<CohortsLandingResponse, number>>(
        { queryKey: ['cohorts-landing'] },
        (old) => {
          if (!old || old.pages.length === 0) return old;

          const firstPage = old.pages[0];
          const brandNames = selectedBrandIds
            .map((brandId) => firstPage.brands.find((brand) => brand.id === brandId)?.name)
            .filter((name): name is string => Boolean(name));
          const nextRow: CohortsLandingRow = {
            id: optimisticId,
            name: payload.name,
            description: payload.description || null,
            is_static: true,
            type: cohortTypeLabel(selectedBrandIds.length),
            focus_chips: brandNames.slice(0, 3),
            allowed_brands_count: selectedBrandIds.length > 0 ? selectedBrandIds.length : null,
            allowed_brands_label: allowedBrandsLabel(brandNames),
            allowed_tenant_brand_ids: selectedBrandIds.length > 0 ? selectedBrandIds : null,
            gmv_mtd: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.gmv_mtd ?? 0,
            active_members: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.active_members ?? 0,
            total_members: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.total_members ?? 0,
            conversion_pct: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.conversion_pct ?? 0,
            live_catalogs_count: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.live_catalogs_count ?? 0,
            status_label: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.status_label ?? 'Ready',
            status_tone: firstPage.cohorts.find((cohort) => cohort.id === cohortId)?.status_tone ?? 'neutral',
          };

          const updatedFirstPage: CohortsLandingResponse = {
            ...firstPage,
            total: (firstPage.total ?? firstPage.cohorts.length) + (cohortId ? 0 : 1),
            kpis: {
              ...firstPage.kpis,
              total_cohorts: firstPage.kpis.total_cohorts + (cohortId ? 0 : 1),
            },
            cohorts: cohortId
              ? firstPage.cohorts.map((cohort) => (cohort.id === cohortId ? { ...cohort, ...nextRow, id: cohortId } : cohort))
              : [nextRow, ...firstPage.cohorts],
          };

          return {
            ...old,
            pages: [updatedFirstPage, ...old.pages.slice(1)],
          };
        },
      );

      return { snapshots };
    },
    onError: (error, _payload, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      toast.error(error instanceof Error ? error.message : 'Could not save customer group');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-cohort-options'] });
      if (cohortId) {
        queryClient.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
      }
      toast.success(cohortId ? 'Customer group updated' : 'Customer group created');
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
        throw new Error((body as { error?: string }).error ?? 'Failed to update customer group');
      }

      return res.json() as Promise<{ cohort: { updated_at: string } }>;
    },
    onMutate: async (payload) => {
      const snapshots = await takeSnapshots(queryClient, [['cohort-detail', id], ['cohorts-landing']]);

      queryClient.setQueriesData<CohortDetailResponse>({ queryKey: ['cohort-detail', id] }, (old) => {
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
      toast.error(error instanceof Error ? error.message : 'Could not update customer group');
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
            member_count: result.cached_member_count ?? old.meta_strip_4.member_count,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['cohort-members', id] });
      toast.success('Membership refreshed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not refresh customer group');
    },
  });
}

export function useAddCohortMembers(cohortId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (buyerIds: string[]) => {
      const res = await apiFetch(`/api/cohorts/${cohortId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_ids: buyerIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to add members');
      }
      return res.json() as Promise<{ ok: boolean; count: number }>;
    },
    onMutate: async (buyerIds) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['cohort-detail', cohortId],
        ['cohorts-landing'],
      ]);
      patchCohortMemberCaches(queryClient, cohortId, buyerIds, true);
      return { snapshots };
    },
    onSuccess: (_result, buyerIds) => {
      patchCohortMemberCaches(queryClient, cohortId, buyerIds, true);
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
      refreshMembershipFilterQueries(queryClient, ['cohort-buyers-detail']);
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      toast.success('Buyers added to customer group');
    },
    onError: (error, _buyerIds, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohort-buyers-detail'] });
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      toast.error(error instanceof Error ? error.message : 'Could not add buyers');
    },
  });
}

export function useRemoveCohortMembers(cohortId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (buyerIds: string[]) => {
      const results = await Promise.all(
        buyerIds.map((buyerId) =>
          apiFetch(`/api/cohorts/${cohortId}/members?buyer_id=${encodeURIComponent(buyerId)}`, { method: 'DELETE' }),
        ),
      );
      const failed = results.find((res) => !res.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to remove members');
      }
      return { ok: true };
    },
    onMutate: async (buyerIds) => {
      const snapshots = await takeSnapshots(queryClient, [
        ['cohort-detail', cohortId],
        ['cohorts-landing'],
      ]);
      patchCohortMemberCaches(queryClient, cohortId, buyerIds, false);
      return { snapshots };
    },
    onSuccess: (_result, buyerIds) => {
      patchCohortMemberCaches(queryClient, cohortId, buyerIds, false);
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
      refreshMembershipFilterQueries(queryClient, ['cohort-buyers-detail']);
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      toast.success('Buyers removed from customer group');
    },
    onError: (error, _buyerIds, ctx) => {
      rollbackSnapshots(queryClient, ctx?.snapshots);
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
      queryClient.invalidateQueries({ queryKey: ['cohort-buyers-detail'] });
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      toast.error(error instanceof Error ? error.message : 'Could not remove buyers');
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
        throw new Error((body as { error?: string }).error ?? 'Failed to archive customer group');
      }

      return res.json() as Promise<{ ok: true }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cohorts-landing'] });
      queryClient.invalidateQueries({ queryKey: ['cohort-detail', id] });
      toast.success('Cohort archived');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not archive customer group');
    },
  });
}
