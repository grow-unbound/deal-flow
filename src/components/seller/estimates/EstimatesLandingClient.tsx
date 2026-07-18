'use client';

import { useDeferredValue, useMemo } from 'react';
import { Plus, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  PageHeader,
  PageWrap,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { TransactionTable } from '@/components/seller/transactional';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import { useTenantEstimates, useTenantEstimatesInfinite, type EstimateLandingRow, type TenantEstimatesResponse } from '@/hooks/useEstimates';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatCompactInr, formatDate, formatMetricValue } from '@/lib/utils';
import { sellerLandingMetricSuffix, type SellerLandingPeriod } from '@/lib/seller-period';
import { EstimatesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first' | 'Total amount (high → low)' | 'Status (workflow order)' | 'Expiry (soonest first)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'Total amount (high → low)', 'Status (workflow order)', 'Expiry (soonest first)'];
const STATUS_SORT_RANK: Record<EstimateLandingRow['status']['value'], number> = {
  draft: 0,
  sent: 1,
  accepted: 2,
  declined: 3,
  expired: 4,
  converted: 5,
  invoiced: 6,
  void: 7,
  pending: 8,
};

function mapRowToCallout(row: Pick<EstimateLandingRow, 'id' | 'buyer_initials' | 'buyer_hue' | 'buyer_name'>) {
  return {
    id: row.id,
    initials: row.buyer_initials,
    hue: row.buyer_hue,
    name: row.buyer_name,
  };
}

function compareStatusRows(a: EstimateLandingRow, b: EstimateLandingRow) {
  const rankDelta = STATUS_SORT_RANK[a.status.value] - STATUS_SORT_RANK[b.status.value];
  if (rankDelta !== 0) return rankDelta;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function buyerGeographyLabel(row: EstimateLandingRow) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function sourceLabel(row: EstimateLandingRow) {
  return row.source_label;
}

function matchesEstimateSearch(row: EstimateLandingRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.estimate_number,
    row.buyer_name,
    row.location_name,
    row.source_label,
    row.campaign_name ?? null,
    row.place_of_supply ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function EstimatesLoadingSkeleton() {
  return (
    <PageWrap className="max-w-[1920px]">
      <div className="h-24 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="h-[420px] animate-pulse bg-cream-50" />
      </div>
    </PageWrap>
  );
}

function EstimatesDataSkeleton() {
  return (
    <>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="h-[420px] animate-pulse bg-cream-50" />
      </div>
    </>
  );
}

function EstimatesLandingContent({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantEstimatesResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const metricSuffix = sellerLandingMetricSuffix(period);
  const summaryQuery = useTenantEstimates(period, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { createEstimates } = useCreateFlags();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-estimates-landing',
    scopeKey: period,
    version: 5,
    initialState: {
      search: '',
      filters: {
        source: [] as string[],
        status: [] as string[],
        location_id: [] as string[],
      },
      sortBy: 'Recent first' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const filters = routeState.filters ?? { source: [], status: [], location_id: [] };
  const sortBy = (routeState.sortBy ?? 'Recent first') as SortOption;

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantEstimatesInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-estimates-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  const firstPage = data?.pages?.[0];
  const allEstimates = useMemo(() => data?.pages?.flatMap((p) => p.estimates) ?? [], [data?.pages]);
  const total = (firstPage as { total?: number | null } | undefined)?.total ?? firstPage?.kpis?.total_estimates_this_period ?? allEstimates.length;

  const filteredRows = useMemo(() => {
    return allEstimates
      .filter((row) => {
        if (!matchesEstimateSearch(row, search)) {
          return false;
        }

        if (filters.source.length > 0 && !filters.source.includes(row.source_label)) {
          return false;
        }

        if (filters.status.length > 0 && !filters.status.includes(row.status.filter_chip)) {
          return false;
        }

        if (filters.location_id.length > 0 && (!row.location_id || !filters.location_id.includes(row.location_id))) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
      if (sortBy === 'Total amount (high → low)') return b.total_amount - a.total_amount;
      if (sortBy === 'Status (workflow order)') return compareStatusRows(a, b);
      if (sortBy === 'Expiry (soonest first)') {
        const aExpiry = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
        const bExpiry = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
        if (aExpiry !== bExpiry) return aExpiry - bExpiry;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allEstimates, filters.location_id, filters.source, filters.status, search, sortBy]);

  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filteredRows.length === 0;
  const subtitle = useMemo(() => {
    const kpis = summaryData?.kpis;
    if (!kpis) {
      return `Track buyer enquiries and seller quotes ${lowerLabel}.`;
    }
    return `${kpis.total_estimates_this_period} estimates in ${horizonLabel.toLowerCase()}.`;
  }, [horizonLabel, lowerLabel, summaryData?.kpis]);

  const pulseAggregates = summaryData?.pulse_aggregates;
  const followUpHint = `${pulseAggregates?.sent_awaiting_count ?? 0}`;
  const expiringHint = `${pulseAggregates?.expiring_soon_count ?? 0}`;

  if (isLoading && !data) return <EstimatesLandingSkeleton />;

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load estimates"
        description="There was a problem fetching the estimates workboard. Please try again."
      />
    );
  }
  if (!data) return <EstimatesLandingSkeleton />;
  const showRefreshingState = isLoading && !data;

  const kpis = summaryData?.kpis;
  const read = summaryData?.todays_read;
  const groups: FilterBarGroup[] = [
    {
      key: 'period',
      label: 'Period',
      options,
      values: [period],
      onChange: (values: string[]) => setPeriod((values[0] as SellerLandingPeriod | undefined) ?? 'month'),
    },
    ...(summaryData?.filters?.groups ?? []).map((group) => ({
      key: group.key,
      label: group.label,
      options: group.options,
      values: filters[group.key as keyof typeof filters] ?? [],
      onChange: (values: string[]) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), [group.key]: values },
      })),
    })),
  ];

  return (
    <>
      <PageWrap className="max-w-[1920px]">
        <PageHeader
          eyebrow="Enquiries"
          title="Estimates"
          subtitle={subtitle}
          horizon={horizonLabel}
          showHorizonControl={false}
          primary={createEstimates ? 'Add an estimate' : undefined}
          onPrimaryClick={createEstimates ? () => router.push('/estimates/new') : undefined}
        />

        {showRefreshingState ? (
          <EstimatesDataSkeleton />
        ) : isError ? (
          <ErrorState
            heading="Couldn't load estimates"
            description="There was a problem fetching the estimates workboard. Please try again."
          />
        ) : (
          <>
            <InsightStrip4
              tiles={[
                {
                  label: 'Estimate value created',
                  value: formatMetricValue('estimate value', kpis?.total_gmv_this_period ?? 0),
                  sub: `${kpis?.total_estimates_this_period ?? 0} estimates ${period}`,
                },
                {
                  label: 'Open estimates',
                  value: formatMetricValue('estimate value', kpis?.open_estimate_value ?? 0),
                  sub: `${kpis?.open_estimates_this_period ?? 0} open estimates ${period}`,
                  tone: 'accent',
                },
                {
                  label: 'Awaiting action 3+ days',
                  value: formatMetricValue('estimate value', pulseAggregates?.sent_awaiting_value ?? 0),
                  sub: `${pulseAggregates?.sent_awaiting_count ?? 0} sent and pending ${period}`,
                },
                {
                  label: 'Expiring in 7 days',
                  value: formatMetricValue('estimate value', pulseAggregates?.expiring_soon_value ?? 0),
                  sub: `${pulseAggregates?.expiring_soon_count ?? 0} unresolved estimates ${period}`,
                },
              ]}
            />

            <V3CalloutPanel
              items={[
                {
                  id: 'needs_follow_up',
                  kind: 'risk',
                  eyebrow: 'Sent awaiting action',
                  hint: followUpHint,
                  getHref: (row) => `/estimates/${row.id}`,
                  rows: (read?.needs_follow_up ?? []).map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.estimate_number} · Sent ${row.sent_at ? formatDate(row.sent_at) : '—'}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  id: 'drafts_not_sent',
                  kind: 'info',
                  eyebrow: 'Drafts not sent',
                  hint: `${kpis?.open_drafts ?? 0}`,
                  getHref: (row) => `/estimates/${row.id}`,
                  rows: (read?.drafts_not_sent ?? []).map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.estimate_number} · ${row.estimate_date ? formatDate(row.estimate_date) : '—'}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  id: 'expiring_soon',
                  kind: 'opportunity',
                  eyebrow: 'Expiring unresolved',
                  hint: expiringHint,
                  getHref: (row) => `/estimates/${row.id}`,
                  rows: (read?.expiring_soon ?? []).map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.estimate_number} · Expires ${row.expires_at ? formatDate(row.expires_at) : '—'}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
              ]}
            />

            <FilterBar
              count={`Showing ${filteredRows.length} of ${total}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
              searchPlaceholder="Search estimate number…"
              chips={[]}
              activeChip=""
              sortBy={sortBy}
              hideViewToggle
              groups={groups}
              searchValue={search}
              onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
              sortOptions={SORT_OPTIONS}
              onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
            />

            <div className="overflow-x-auto">
              {showTableSkeleton ? (
                <EstimatesDataSkeleton />
              ) : filteredRows.length === 0 ? (
                <EmptyState
                  icon={<FileText size={28} strokeWidth={1.5} />}
                  heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching estimates' : 'No estimates yet'}
                  description={
                    search.trim() || groups.some((group) => group.values.length > 0)
                      ? 'Try a different search or filter combination.'
                      : 'Create an estimate to share pricing with a buyer.'
                  }
                  action={
                    createEstimates ? (
                      <Button variant="accent" asChild>
                        <Link href="/estimates/new" className="inline-flex items-center gap-1.5">
                          <Plus size={13} />
                          Add an estimate
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <TransactionTable
                  kind="estimate"
                  showCampaignColumn={showCampaignColumn}
                  tableMinWidth={showCampaignColumn ? 1450 : 1230}
                  rows={filteredRows.map((row) => ({
                    id: row.id,
                    href: `/estimates/${row.id}`,
                    document_number: row.estimate_number,
                    realtime_badge: newEntityIds.has(row.id) ? 'new' : undefined,
                    source_kind: row.source_kind,
                    source_label: row.source_label,
                    buyer_name: row.buyer_name,
                    buyer_place_of_supply: row.place_of_supply ?? buyerGeographyLabel(row),
                    buyer_initials: row.buyer_initials,
                    buyer_hue: row.buyer_hue,
                    location_name: row.location_name,
                    campaign_name: row.campaign_name ?? row.catalog_name,
                    items_count: row.items_count,
                    total_amount: row.total_amount,
                    status_label: row.status.label,
                    status_tone: row.status.tone,
                    created_at: row.created_at,
                    expires_at: row.expires_at,
                  }))}
                  onRowClick={(row) => {
                    markSeen(row.id);
                    router.push(row.href);
                  }}
                />
              )}
            </div>

            {/* Scroll sentinel — triggers next-page fetch 400px before list end */}
            <div ref={sentinelRef} className="h-px" aria-hidden />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Skeleton className="h-8 w-48 rounded-full" />
              </div>
            )}
          </>
        )}
      </PageWrap>

    </>
  );
}

export function EstimatesLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantEstimatesResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');

  if (orderManagement === false || estimatesFlag === false) {
    return <FeatureDisabledState />;
  }

  return <EstimatesLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />;
}
