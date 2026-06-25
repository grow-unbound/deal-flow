'use client';

import { useMemo } from 'react';
import { Upload, Plus, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantEstimates, useTenantEstimatesInfinite, type EstimateLandingRow, type TenantEstimatesResponse } from '@/hooks/useEstimates';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn, formatCompactInr, formatDate } from '@/lib/utils';
import { sellerLandingMetricSuffix, type SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'Recent first' | 'Total amount (high → low)' | 'Status (workflow order)' | 'Expiry (soonest first)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'Total amount (high → low)', 'Status (workflow order)', 'Expiry (soonest first)'];
const DAY_MS = 24 * 60 * 60 * 1000;
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

function mapRowToCallout(row: Pick<EstimateLandingRow, 'buyer_initials' | 'buyer_hue' | 'buyer_name'>) {
  return {
    initials: row.buyer_initials,
    hue: row.buyer_hue,
    name: row.buyer_name,
  };
}

function isOpenStatusValue(value: string): boolean {
  return value === 'draft' || value === 'sent' || value === 'accepted';
}

function countFollowUpCandidates(rows: EstimateLandingRow[]): number {
  const cutoff = Date.now() - 3 * DAY_MS;
  return rows.filter(
    (r) => r.status.value === 'sent' && r.sent_at && new Date(r.sent_at).getTime() < cutoff,
  ).length;
}

function countExpiringSoonOpen(rows: EstimateLandingRow[]): number {
  const limit = Date.now() + 7 * DAY_MS;
  return rows.filter((r) => {
    if (!isOpenStatusValue(r.status.value) || !r.expires_at) return false;
    const ex = new Date(r.expires_at).getTime();
    return ex <= limit;
  }).length;
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
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
}: {
  initialData: TenantEstimatesResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const metricSuffix = sellerLandingMetricSuffix(period);
  const summaryQuery = useTenantEstimates(period, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-estimates-landing',
    scopeKey: period,
    version: 4,
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
  const search = routeState.search;
  const filters = routeState.filters ?? { source: [], status: [], location_id: [] };
  const sortBy = (routeState.sortBy ?? 'Recent first') as SortOption;

  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantEstimatesInfinite(
    period,
    { search: debouncedSearch, ...filters },
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
    return [...allEstimates].sort((a, b) => {
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
  }, [allEstimates, sortBy]);

  const subtitle = useMemo(() => {
    const kpis = summaryData?.kpis;
    if (!kpis) {
      return `Track buyer enquiries and seller quotes ${lowerLabel}.`;
    }
    return `${kpis.total_estimates_this_period} estimates ${lowerLabel} with ${formatCompactInr(kpis.total_gmv_this_period)} GMV. ${kpis.open_estimates_this_period} open and ${kpis.converted_this_period} converted ${lowerLabel}.`;
  }, [lowerLabel, summaryData?.kpis]);

  const followUpHint = useMemo(() => `${countFollowUpCandidates(allEstimates)}`, [allEstimates]);
  const expiringHint = useMemo(() => `${countExpiringSoonOpen(allEstimates)}`, [allEstimates]);

  if (isLoading && !data) return <EstimatesLoadingSkeleton />;

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load estimates"
        description="There was a problem fetching the estimates workboard. Please try again."
      />
    );
  }
  if (!data) return <EstimatesLoadingSkeleton />;
  const showRefreshingState = isLoading && !data;

  const kpis = summaryData?.kpis;
  const read = summaryData?.todays_read;
  const groups: FilterBarGroup[] = (summaryData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof typeof filters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
    })),
  }));

  return (
    <>
      <PageWrap className="max-w-[1920px]">
        <PageHeader
          eyebrow="Enquiries"
          title="Estimates"
          subtitle={subtitle}
          horizon={horizonLabel}
          period={period}
          periodOptions={options}
          onPeriodChange={setPeriod}
          primary="Add an estimate"
          onPrimaryClick={() => router.push('/estimates/new')}
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
                  label: `Estimates · ${metricSuffix}`,
                  value: `${kpis?.total_estimates_this_period}`,
                  sub: `${(kpis?.total_estimates_growth_pct ?? 0) >= 0 ? '↑ +' : '↓ '}${Math.abs(kpis?.total_estimates_growth_pct ?? 0)}% vs last period`,
                },
                {
                  label: 'GMV',
                  value: formatCompactInr(kpis?.total_gmv_this_period ?? 0),
                  sub: `AOV ${formatCompactInr(kpis?.aov ?? 0)}`,
                  tone: 'accent',
                },
                {
                  label: 'Open estimates',
                  value: `${kpis?.open_estimates_this_period}`,
                  sub: `${kpis?.open_drafts} draft · ${kpis?.open_sent} sent · ${kpis?.open_accepted} accepted`,
                },
                {
                  label: `Converted · ${metricSuffix}`,
                  value: `${kpis?.converted_this_period}`,
                  sub: 'converted to SO or invoice',
                },
              ]}
            />

            <V3CalloutPanel
              items={[
                {
                  kind: 'risk',
                  eyebrow: 'Needs a follow-up',
                  hint: followUpHint,
                  rows: (read?.needs_follow_up ?? []).map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.estimate_number} · Sent ${row.sent_at ? formatDate(row.sent_at) : '—'}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  kind: 'info',
                  eyebrow: 'Ready to convert',
                  hint: `${kpis?.ready_to_convert}`,
                  rows: (read?.ready_to_convert ?? []).map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.estimate_number} · ${row.items_count} items`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  kind: 'opportunity',
                  eyebrow: 'Expiring soon',
                  hint: expiringHint,
                  rows: (read?.expiring_soon ?? []).map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.estimate_number} · expires in ${daysUntil(row.expires_at)}d`,
                    trailing: (
                      <span className="inline-flex font-sans">
                        <StatusTag label={row.status.label} tone={row.status.tone} />
                      </span>
                    ),
                  })),
                },
              ]}
            />

            <FilterBar
              count={`Showing ${filteredRows.length} of ${total}`}
              searchPlaceholder="Search estimate number, buyer, geography, catalog…"
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

            <LandingTable
              showEmptyState={filteredRows.length === 0}
              emptyState={
                <EmptyState
                  icon={<FileText size={28} strokeWidth={1.5} />}
                  heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching estimates' : 'No estimates yet'}
                  description={
                    search.trim() || groups.some((group) => group.values.length > 0)
                      ? 'Try a different search or filter combination.'
                      : 'Create an estimate to share pricing with a buyer.'
                  }
                  action={
                    <Button variant="accent" asChild>
                      <Link href="/estimates/new" className="inline-flex items-center gap-1.5">
                        <Plus size={13} />
                        Add an estimate
                      </Link>
                    </Button>
                  }
                />
              }
              tableClassName="v2-table"
              columns={[
                { label: 'Estimate Number', width: 160, className: 'px-5' },
                { label: 'Buyer', width: 270, className: 'px-5' },
                { label: 'Source', className: 'px-5' },
                { label: 'Location', className: 'px-5' },
                { label: 'Campaign', className: 'px-5' },
                { label: 'Items', align: 'right', className: 'px-5' },
                { label: 'Total Amount', align: 'right', className: 'px-5' },
                { label: 'Status', className: 'px-5' },
                { label: 'Created', className: 'px-5' },
                { label: 'Expires', className: 'px-5' },
                { width: 40, className: 'px-4' },
              ]}
            >
                {filteredRows.map((row) => {
                const expiringSoon =
                  row.expires_at &&
                  isOpenStatusValue(row.status.value) &&
                  new Date(row.expires_at).getTime() < Date.now() + 7 * DAY_MS;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                    onClick={() => { markSeen(row.id); router.push(`/estimates/${row.id}`); }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium text-cream-900">{row.estimate_number}</p>
                        {newEntityIds.has(row.id) && <RealtimeBadge type="new" />}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="ent flex items-center gap-3">
                        <EntityAvatar initials={row.buyer_initials} hue={row.buyer_hue} size={32} />
                        <div className="ent-meta min-w-0">
                          <p className="truncate font-mono text-sm font-medium text-cream-900">{row.buyer_name}</p>
                          <p className="ent-sub truncate">{buyerGeographyLabel(row)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="truncate text-sm text-cream-900">{sourceLabel(row)}</p>
                      <p className="mt-0.5 truncate text-xs text-cream-600">
                        {row.source_detail}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-cream-900">{row.location_name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <p className="truncate text-sm text-cream-900">{row.catalog_name ?? '—'}</p>
                    </td>
                    <td className="num px-5 py-3.5 text-base text-cream-900">{row.items_count}</td>
                    <td className="num num-display px-5 py-3.5 text-right text-cream-900">
                      {formatCompactInr(row.total_amount)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusTag label={row.status.label} tone={row.status.tone} />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-sm text-cream-700">{formatDate(row.created_at)}</td>
                    <td
                      className={cn(
                        'px-5 py-3.5 font-mono text-sm',
                        expiringSoon ? 'text-danger-700' : 'text-cream-900',
                      )}
                    >
                      {row.expires_at ? formatDate(row.expires_at) : '—'}
                    </td>
                    <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
                  </tr>
                );
              })}
            </LandingTable>

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
}: {
  initialData: TenantEstimatesResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');

  if (orderManagement === false || estimatesFlag === false) {
    return <FeatureDisabledState />;
  }

  return <EstimatesLandingContent initialData={initialData} initialPeriod={initialPeriod} />;
}
