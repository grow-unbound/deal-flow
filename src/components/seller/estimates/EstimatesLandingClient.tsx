'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Plus, FileText } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  PageHeader,
  PageWrap,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { TransactionTable } from '@/components/seller/transactional';
import { SellerMobileTransactionTabs, SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import {
  useTenantEstimatesInfinite,
  useTenantEstimatesMetrics,
  type EstimatesLandingKpiCardV4,
  type EstimateLandingRow,
  type EstimatesLandingMetricsV4,
} from '@/hooks/useEstimates';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { parseSellerLandingPeriod, type SellerLandingPeriod } from '@/lib/seller-period';
import { EstimatesLandingSkeleton, TableRowsSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first' | 'Value (high → low)' | 'Status (workflow order)' | 'Expiry (soonest first)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'Value (high → low)', 'Status (workflow order)', 'Expiry (soonest first)'];
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

function compareStatusRows(a: EstimateLandingRow, b: EstimateLandingRow) {
  const rankDelta = STATUS_SORT_RANK[a.status.value] - STATUS_SORT_RANK[b.status.value];
  if (rankDelta !== 0) return rankDelta;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function buyerGeographyLabel(row: EstimateLandingRow) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function sourceLabel(row: EstimateLandingRow) {
  return row.source_kind === 'buyer_app' ? 'Buyer App' : 'Direct';
}

function estimateSourceDisplayLabel(row: EstimateLandingRow) {
  if (row.source_kind === 'buyer_app') return 'BUYER APP';
  return row.source_label?.trim() ?? '';
}

function matchesEstimateSearch(row: EstimateLandingRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.estimate_number,
    row.buyer_name,
    row.location_name,
    row.source_label,
    row.source_detail,
    row.campaign_name ?? null,
    row.place_of_supply ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function filtersFromEstimatePreset(preset: Record<string, unknown> | null | undefined) {
  if (!preset) return {
    source: [] as string[],
    status: [] as string[],
    location_id: [] as string[],
    attention: [] as string[],
  };
  const attention: string[] = [];
  if (preset.status === 'sent' && Number(preset.age_gte_days ?? 0) >= 3) attention.push('awaiting_action_3d');
  if (Number(preset.expiry_lte_days ?? 0) > 0) attention.push('expiring_7d');
  return {
    source: [] as string[],
    status: preset.status === 'open'
      ? ['Draft', 'Sent', 'Accepted']
      : preset.status === 'sent'
        ? ['Sent']
        : [],
    location_id: [] as string[],
    attention,
  };
}

function periodFromEstimatePreset(preset: Record<string, unknown> | null | undefined): SellerLandingPeriod | null {
  if (!preset || typeof preset.date_period !== 'string') return null;
  if (preset.date_period === 'today') return 'today';
  if (preset.date_period === 'this_week') return 'week';
  if (preset.date_period === 'this_quarter') return 'quarter';
  if (preset.date_period === 'this_month') return 'month';
  return null;
}

function EstimatesLandingContent({
  initialMetrics,
  initialPeriod,
}: {
  initialMetrics: EstimatesLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/estimates');
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search')?.trim() || undefined;
  const clientInitialPeriod = searchParams.get('period') ? parseSellerLandingPeriod(searchParams.get('period')) : initialPeriod;
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(clientInitialPeriod);
  const metricsQuery = useTenantEstimatesMetrics(period, initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { createEstimates } = useCreateFlags();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-estimates-landing',
    scopeKey: period,
    pathnameOverride: '/estimates',
    version: 5,
    initialState: {
      search: '',
      filters: {
        source: [] as string[],
        status: [] as string[],
        location_id: [] as string[],
        attention: [] as string[],
      },
      filterPreset: null as Record<string, unknown> | null,
      sortBy: 'Recent first' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const filters = routeState.filters ?? { source: [], status: [], location_id: [], attention: [] };
  const filterPreset = routeState.filterPreset ?? null;
  const sortBy = (routeState.sortBy ?? 'Recent first') as SortOption;
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantEstimatesInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters, filter_preset: filterPreset },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-estimates-landing',
    scopeKey: period,
    pathnameOverride: '/estimates',
    ready: !isLoading,
  });

  const firstPage = data?.pages?.[0];
  const allEstimates = useMemo(() => data?.pages?.flatMap((p) => p.estimates) ?? [], [data?.pages]);
  const total = (firstPage as { total?: number | null } | undefined)?.total ?? allEstimates.length;

  const filteredRows = useMemo(() => {
    return allEstimates
      .filter((row) => {
        if (!matchesEstimateSearch(row, search)) {
          return false;
        }

        if (filters.source.length > 0 && !filters.source.includes(sourceLabel(row))) {
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
      if (sortBy === 'Value (high → low)') return b.total_amount - a.total_amount;
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

  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(filteredRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [filteredRows.length],
  );
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filteredRows.length === 0;
  const subtitle = useMemo(() => {
    return `Track buyer enquiries and seller quotes ${lowerLabel}.`;
  }, [lowerLabel]);

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load estimates"
        description="There was a problem fetching the estimates workboard. Please try again."
      />
    );
  }
  const showRefreshingState = isLoading && !data;

  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading estimates" showTransactionTabs variant="transaction" />
    ) : (
      <EstimatesLandingSkeleton />
    );
  }

  const kpiOptions = (metricsData?.cards ?? []).map((card: EstimatesLandingKpiCardV4) => ({
    id: card.id,
    label: card.label,
    value: formatNumberValue(Number(card.value ?? 0), 'CURRENCY_THRESHOLD'),
    sub: card.supporting_text ?? `${card.document_count ?? card.entity_count ?? 0} estimates`,
    filterPreset: card.filter_preset ?? null,
  }));
  const selectedOption = selectedKpiKey ? kpiOptions.find((option) => option.id === selectedKpiKey) ?? null : null;
  const groups: FilterBarGroup[] = [
    {
      key: 'period',
      label: 'Period',
      options,
      values: [period],
      onChange: (values: string[]) => {
        setSelectedKpiKey(null);
        setPeriod((values[0] as SellerLandingPeriod | undefined) ?? 'month');
        setRouteState((current) => ({ ...current, filterPreset: null }));
      },
    },
    ...(firstPage?.filters?.groups ?? []).map((group) => ({
      key: group.key,
      label: group.label,
      options: group.options,
      values: filters[group.key as keyof typeof filters] ?? [],
      onChange: (values: string[]) => setRouteState((current) => ({
        ...current,
        filterPreset: null,
        filters: { ...(current.filters ?? filters), [group.key]: values },
      })),
    })),
  ];

  return (
    <>
      <PageWrap className="max-w-[1920px] flex h-full min-h-0 flex-col">
        <StickyListHeader>
          <SplitPaneStickyHeaderSlot
            isPaneOpen={isPaneOpen}
            showRefreshingState={showRefreshingState}
            isError={isError}
            showTransactionTabs
          >
            <PageHeader
              eyebrow={isPaneOpen ? 'Estimates' : 'Enquiries'}
              title={isPaneOpen ? selectedOption?.label ?? 'Estimates' : 'Estimates'}
              subtitle={isPaneOpen && selectedOption ? `${selectedOption.value} · ${selectedOption.sub}` : subtitle}
              horizon={horizonLabel}
              showHorizonControl={false}
              primary={createEstimates ? 'Add an estimate' : undefined}
              onPrimaryClick={createEstimates ? () => router.push('/estimates/new') : undefined}
              compact={isPaneOpen}
            />
            <SellerMobileTransactionTabs active="estimates" />

            {isPaneOpen ? null : (
              <InsightStrip4
                tiles={kpiOptions.map((option): InsightTile => ({
                  label: option.label,
                  value: option.value,
                  sub: option.sub,
                  onClick: () => {
                    setSelectedKpiKey(option.id);
                    const presetPeriod = periodFromEstimatePreset(option.filterPreset);
                    if (presetPeriod && presetPeriod !== period) setPeriod(presetPeriod);
                    setRouteState((current) => ({
                      ...current,
                      filterPreset: option.filterPreset,
                      filters: filtersFromEstimatePreset(option.filterPreset),
                    }));
                  },
                  selected: option.id === selectedKpiKey,
                }))}
              />
            )}

            <FilterBar
              count={`Showing ${filteredRows.length} of ${total}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
              searchPlaceholder="Search estimate number…"
              chips={[]}
              activeChip=""
              sortBy={sortBy}
              hideViewToggle
              compact={isPaneOpen}
              groups={groups}
              searchValue={search}
              onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value, filterPreset: null }))}
              sortOptions={SORT_OPTIONS}
              onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
            />
          </SplitPaneStickyHeaderSlot>
        </StickyListHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <ErrorState
            heading="Couldn't load estimates"
            description="There was a problem fetching the estimates workboard. Please try again."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              {showTableSkeleton ? (
                isPaneOpen ? (
                  <SplitPaneListRowsSkeleton isPaneOpen variant="transaction" />
                ) : (
                  <TableRowsSkeleton gridClassName="grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_0.8fr_40px]" cellCount={7} />
                )
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
                  forceCompact={isPaneOpen}
                  selectedId={openId}
                  sentinelIndex={sentinelIndex}
                  sentinelRef={sentinelRef}
                  rows={filteredRows.map((row) => ({
                    id: row.id,
                    href: `/estimates/${row.id}`,
                    document_number: row.estimate_number,
                    realtime_badge: newEntityIds.has(row.id) ? 'new' : undefined,
                    source_kind: row.source_kind,
                    source_label: estimateSourceDisplayLabel(row),
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

            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Skeleton className="h-8 w-48 rounded-full" />
              </div>
            )}
          </>
        )}
        </div>
      </PageWrap>

    </>
  );
}

export function EstimatesLandingClient({
  initialMetrics,
  initialData,
  initialPeriod,
}: {
  initialMetrics?: EstimatesLandingMetricsV4 | null;
  initialData?: EstimatesLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');

  if (orderManagement === false || estimatesFlag === false) {
    return <FeatureDisabledState />;
  }

  return <EstimatesLandingContent initialMetrics={initialMetrics ?? initialData ?? null} initialPeriod={initialPeriod} />;
}
