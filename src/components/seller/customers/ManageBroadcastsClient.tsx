'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { BroadcastComposerSheet } from '@/components/seller/customers/BroadcastComposerSheet';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageWrap,
} from '@/components/seller/layout';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useRole } from '@/hooks/useRole';
import {
  useWhatsAppBroadcastsInfinite,
  type BroadcastKpis,
  type BroadcastSortOption,
  type BroadcastsPageResponse,
  type ManageBroadcastRow,
} from '@/hooks/useWhatsAppBroadcasts';
import { formatDate, formatNumberValue } from '@/lib/utils';

const PAGE_LIMIT = 50;

const SORT_OPTIONS = [
  'Sent date (newest first)',
  'Sent date (oldest first)',
  'Broadcast name (A→Z)',
  'Broadcast name (Z→A)',
] as const;

type SortLabel = (typeof SORT_OPTIONS)[number];

const SORT_TO_API: Record<SortLabel, BroadcastSortOption> = {
  'Sent date (newest first)': 'date_desc',
  'Sent date (oldest first)': 'date_asc',
  'Broadcast name (A→Z)': 'name_asc',
  'Broadcast name (Z→A)': 'name_desc',
};

const STATUS_FILTER_GROUP: FilterBarGroup = {
  key: 'status',
  label: 'Status',
  options: [
    { value: 'completed', label: 'Completed' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'sending', label: 'Sending' },
    { value: 'partially_failed', label: 'Partially failed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending_review', label: 'Pending review' },
  ],
  values: [],
  onChange: () => {},
};

const EMPTY_KPIS: BroadcastKpis = {
  total_broadcasts: 0,
  delivered_this_month: 0,
  scheduled_count: 0,
  success_rate_pct: 0,
  sent_this_month: 0,
};

function formatBroadcastDate(row: ManageBroadcastRow): string {
  return formatDate(row.display_at);
}

function formatDeliveryStatus(row: ManageBroadcastRow): string {
  if (row.delivered_count > 0) {
    return `${row.delivered_count}/${row.total_count} delivered`;
  }
  if (row.sent_count > 0) {
    return `${row.sent_count}/${row.total_count} sent`;
  }
  if (row.failed_count > 0 && row.total_count > 0) {
    return `${row.failed_count}/${row.total_count} failed`;
  }
  return `0/${row.total_count} queued`;
}

function buildInsightTiles(kpis: BroadcastKpis) {
  return [
    { label: 'Total broadcasts', value: formatNumberValue(kpis.total_broadcasts, 'COUNT') },
    {
      label: 'Delivered this month',
      value: formatNumberValue(kpis.delivered_this_month, 'COUNT'),
      sub: `${formatNumberValue(kpis.sent_this_month, 'COUNT')} sent this month`,
    },
    { label: 'Scheduled', value: formatNumberValue(kpis.scheduled_count, 'COUNT') },
    {
      label: 'Success rate',
      value: `${kpis.success_rate_pct}%`,
      sub: 'Delivered or read vs terminal sends',
    },
  ];
}

function ManageBroadcastsInner({
  initialData,
}: {
  initialData: BroadcastsPageResponse | null;
}) {
  const { isSellerAssistant } = useRole();
  const [composerOpen, setComposerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortLabel>(SORT_OPTIONS[0]);

  const debouncedSearch = useDebounce(search, 300);
  const deferredStatus = useDeferredValue(statusFilter);
  const isInterim = search !== debouncedSearch || statusFilter !== deferredStatus;

  const status = deferredStatus[0] ?? 'all';
  const sort = SORT_TO_API[sortBy];

  const {
    data,
    isLoading,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWhatsAppBroadcastsInfinite(
    { q: debouncedSearch, status, sort, limit: PAGE_LIMIT },
    initialData,
  );

  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: () => { void fetchNextPage(); },
  });

  const broadcasts = useMemo(
    () => data?.pages.flatMap((page) => page.broadcasts) ?? [],
    [data?.pages],
  );
  const kpis = data?.pages[0]?.kpis ?? initialData?.kpis ?? EMPTY_KPIS;
  const total = data?.pages[0]?.total ?? broadcasts.length;
  const showTableSkeleton = isLoading && broadcasts.length === 0;

  const filterGroups = useMemo<FilterBarGroup[]>(() => [
    {
      ...STATUS_FILTER_GROUP,
      values: statusFilter,
      onChange: setStatusFilter,
    },
  ], [statusFilter]);

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load broadcasts"
        description="There was a problem fetching your broadcast history. Please try again."
      />
    );
  }

  return (
    <PageWrap className="pt-7">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <nav className="mb-4 flex items-center gap-1.5 text-sm text-cream-600">
            <Link href="/customers" className="hover:text-cream-900">
              Customers
            </Link>
            <span className="text-cream-400">›</span>
            <span className="font-medium text-cream-900">Manage Broadcasts</span>
          </nav>
          <h1 className="font-display text-lg md:text-xl font-extrabold tracking-[-0.025em] text-cream-950">
            Manage Broadcasts
          </h1>
          <p className="mt-[10px] max-w-[64ch] text-md leading-[1.55] text-cream-700">
            Send targeted messages to select groups of customers and monitor delivery
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 sm:self-end"
          onClick={() => setComposerOpen(true)}
          disabled={isSellerAssistant}
          title={isSellerAssistant ? 'Only admins can send broadcasts' : undefined}
        >
          <Megaphone size={16} className="mr-2" />
          Broadcast Now
        </Button>
      </header>

      <InsightStrip4 className="mt-6" tiles={buildInsightTiles(kpis)} />

      <FilterBar
        count={`Showing ${broadcasts.length} of ${total}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
        searchPlaceholder="Search broadcast or template…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={filterGroups}
        searchValue={search}
        onSearchChange={setSearch}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortLabel)}
      />

      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={5} tableMinWidth={1100} />
      ) : (
        <LandingTable
          showEmptyState={broadcasts.length === 0 && !isLoading}
          emptyState={
            <EmptyState
              icon={<Megaphone size={28} strokeWidth={1.5} />}
              heading={search.trim() || statusFilter.length > 0 ? 'No matching broadcasts' : 'No broadcasts yet'}
              description={
                search.trim() || statusFilter.length > 0
                  ? 'Try a different search or filter combination.'
                  : 'Send your first broadcast to reach customers on WhatsApp.'
              }
              action={
                !isSellerAssistant ? (
                  <Button type="button" onClick={() => setComposerOpen(true)}>
                    <Megaphone size={16} className="mr-2" />
                    Broadcast Now
                  </Button>
                ) : undefined
              }
            />
          }
          columns={[
            { label: 'Date', minWidth: 140, maxWidth: 160, className: 'px-5' },
            { label: 'Broadcast name', minWidth: 220, className: 'px-5' },
            { label: 'Template name', minWidth: 180, className: 'px-5' },
            { label: 'Target customers', minWidth: 200, className: 'px-5' },
            { label: 'Status', minWidth: 160, className: 'px-5' },
          ]}
          tableMinWidth={1100}
        >
          {broadcasts.map((broadcast) => (
            <tr
              key={broadcast.id}
              className="cursor-pointer border-b border-cream-300 bg-white hover:bg-cream-50"
            >
              <td className="px-3 py-3 text-sm text-cream-800">
                <Link href={`/customers/broadcasts/${broadcast.id}`} className="block">
                  {formatBroadcastDate(broadcast)}
                </Link>
              </td>
              <td className="px-3 py-3 text-sm font-medium text-cream-900">
                <Link href={`/customers/broadcasts/${broadcast.id}`} className="block">
                  {broadcast.name}
                </Link>
              </td>
              <td className="px-3 py-3 text-sm text-cream-800">
                <Link href={`/customers/broadcasts/${broadcast.id}`} className="block">
                  {broadcast.template_name ?? '—'}
                </Link>
              </td>
              <td className="px-3 py-3 text-sm text-cream-800">
                <Link href={`/customers/broadcasts/${broadcast.id}`} className="block">
                  {broadcast.target_label}
                </Link>
              </td>
              <td className="px-3 py-3 text-sm text-cream-800">
                <Link href={`/customers/broadcasts/${broadcast.id}`} className="block">
                  {formatDeliveryStatus(broadcast)}
                </Link>
              </td>
            </tr>
          ))}
        </LandingTable>
      )}

      <div ref={sentinelRef} className="h-px" aria-hidden />
      {isFetchingNextPage ? (
        <div className="flex justify-center py-4">
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>
      ) : null}

      {composerOpen ? (
        <BroadcastComposerSheet open={composerOpen} onOpenChange={setComposerOpen} />
      ) : null}
    </PageWrap>
  );
}

export function ManageBroadcastsClient({
  initialData,
}: {
  initialData: BroadcastsPageResponse | null;
}) {
  return (
    <FeatureGate flag="WHATSAPP_BROADCAST">
      <ManageBroadcastsInner initialData={initialData} />
    </FeatureGate>
  );
}
