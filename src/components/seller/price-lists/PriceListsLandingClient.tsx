'use client';

import { useMemo, useState } from 'react';
import { Copy, Plus, ListOrdered } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import Link from 'next/link';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { usePriceListsLanding, type PriceListLandingRow, type PriceListsLandingResponse } from '@/hooks/usePriceLists';
import { cn, formatDate, formatNumberValue } from '@/lib/utils';
import { formatStrategySummary } from '@/lib/price-list-strategy';
import { PriceListsLandingSkeleton as SharedPriceListsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingPageLoadMore } from '@/components/seller/layout/LandingPageLoadMore';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { PriceListFormSheet } from './PriceListFormSheet';

type LandingChip = 'Active' | 'Draft' | 'Expired';
type SortOption = 'Recently updated' | 'Name (A-Z)' | 'Products (high → low)' | 'Validity (latest end date)' | 'Priority (high → low)';

const STATUS_OPTIONS: LandingChip[] = ['Draft', 'Active', 'Expired'];
const SORT_OPTIONS: SortOption[] = ['Recently updated', 'Name (A-Z)', 'Products (high → low)', 'Validity (latest end date)', 'Priority (high → low)'];

function PriceListsLandingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-[40rem]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-[14px]" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-[14px]" />
        <Skeleton className="h-[30rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function titleCaseStatus(status: PriceListLandingRow['status']): 'Active' | 'Draft' | 'Expired' {
  if (status === 'active') return 'Active';
  if (status === 'draft') return 'Draft';
  return 'Expired';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toStatusTone(status: PriceListLandingRow['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

function PriceListsLandingContent({
  initialData,
  initialSearch,
}: {
  initialData: PriceListsLandingResponse | null;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const { isSellerAssistant } = useRole();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-price-lists-landing',
    version: 3,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
      },
      sortBy: 'Recently updated' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { status: [] };
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = usePriceListsLanding({ search, status: filters.status }, initialData);
  useRouteScrollRestoration({
    storageKey: 'seller-price-lists-landing',
    ready: !isLoading,
  });
  const statusFilter = filters.status ?? [];
  const groups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS.map((value) => ({ value, label: value })),
      values: statusFilter,
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filters: { ...(current.filters ?? filters), status: values },
        })),
    },
  ];
  const allRows = data?.price_lists ?? [];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const statusFiltered = isFetching !== false ? allRows.filter((row) => {
      if (statusFilter.length === 0 || statusFilter.includes('All')) return true;
      return statusFilter.some((value) => {
        if (value === 'Active') return row.status === 'active';
        if (value === 'Draft') return row.status === 'draft';
        if (value === 'Expired') return row.status === 'expired';
        return false;
      });
    }) : allRows;

    const searched = isFetching !== false ? statusFiltered.filter((row) => {
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || (row.description ?? '').toLowerCase().includes(query);
    }) : statusFiltered;

    return searched.sort((a, b) => {
      if (sortBy === 'Name (A-Z)') return a.name.localeCompare(b.name);
      if (sortBy === 'Products (high → low)') return b.product_count - a.product_count;
      if (sortBy === 'Priority (high → low)') return b.priority - a.priority;
      if (sortBy === 'Validity (latest end date)') {
        return new Date(b.valid_to ?? 0).getTime() - new Date(a.valid_to ?? 0).getTime();
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [allRows, isFetching, search, sortBy, statusFilter]);
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filteredRows.length === 0;

  if (isLoading) return <SharedPriceListsLandingSkeleton />;

  if (isError) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load price lists"
          description="There was a problem fetching your price lists. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  return (
    <>
      <PageWrap>
        <PageHeader
          eyebrow="Pricing"
          title="Price Lists"
          subtitle={`${data?.total ?? allRows.length} Pricelists · ${data?.kpis.active_lists ?? 0} active.`}
          horizon="Now"
          {...(isSellerAssistant ? {} : {
            primary: 'Add a price list',
            onPrimaryClick: () => setFormOpen(true),
          })}
        />
        <PriceListFormSheet open={formOpen} onOpenChange={setFormOpen} mode="create" />

        <InsightStrip4
          tiles={[
            {
              label: 'Products with custom prices',
              value: `${data?.kpis.products_with_custom_prices ?? data?.kpis.products_with_overrides ?? 0}`,
              sub: 'products',
            },
            {
              label: 'Customers with active custom pricing',
              value: `${data?.kpis.customers_with_custom_prices ?? 0}`,
              sub: 'customers',
            },
            {
              label: 'Products priced below base rate',
              value: `${data?.kpis.products_below_base_rate ?? 0}`,
              sub: 'products',
              tone: 'warn',
            },
            {
              label: 'Pricelists expiring soon',
              value: `${data?.kpis.expiring_soon ?? 0}`,
              sub: 'within 7 days',
              tone: 'warn',
            },
          ]}
        />

        <FilterBar
          count={`${filteredRows.length} price lists`}
          searchPlaceholder="Search price list…"
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

        {showTableSkeleton ? (
          <LandingTableRowsSkeleton columns={isSellerAssistant ? 8 : 9} tableMinWidth={1240} />
        ) : (
        <LandingTable
          showEmptyState={filteredRows.length === 0 && !isLoading}
          emptyState={
            <EmptyState
              icon={<ListOrdered size={28} strokeWidth={1.5} />}
              heading={search.trim() || statusFilter.length > 0 ? 'No matching price lists' : 'No price lists yet'}
              description={
                search.trim() || statusFilter.length > 0
                  ? 'Try a different search or status filter.'
                  : isSellerAssistant
                    ? 'No price lists are available yet.'
                    : 'Create a price list to set cohort pricing.'
              }
              action={!isSellerAssistant ? (
                <Button variant="accent" onClick={() => setFormOpen(true)}>
                    <Plus size={13} />
                    Add a price list
                </Button>
              ) : undefined}
            />
          }
          columns={[
            { label: 'Price list', minWidth: 280, maxWidth: 360, className: 'px-5' },
            { label: 'Pricing strategy', minWidth: 180, maxWidth: 220, className: 'px-5' },
            { label: 'Priority', align: 'center', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Products', align: 'center', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Validity', minWidth: 200, maxWidth: 260, className: 'px-5' },
            { label: 'Avg discount', align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
            ...(isSellerAssistant ? [] : [{ label: 'Avg margin', align: 'right' as const, minWidth: 140, maxWidth: 160, className: 'px-5' }]),
            { label: 'Status', minWidth: 140, maxWidth: 180, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1240}
        >
          {filteredRows.map((row) => {
            const validity = `${formatDate(row.valid_from ?? row.created_at)} → ${row.valid_to ? formatDate(row.valid_to) : 'Open'}`;
            const isExpired = row.status === 'expired';
            const strategySub = formatStrategySummary(row.pricing_strategy, row.strategy_value);

            return (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100"
                onClick={() => router.push(`/price-lists/${row.id}`)}
                onPointerDown={() => triggerHaptic()}
              >
                <td className="px-3 py-2 text-base text-cream-900">
                  <div className="ent flex items-center gap-3">
                    <EntityAvatar initials={getInitials(row.name)} hue="teal" size={38} />
                    <div className="min-w-0">
                      <p className="ent-name truncate text-base font-medium text-cream-900">{row.name}</p>
                      <p className="ent-sub mt-0.5 truncate text-xs text-cream-500">
                        {row.description ?? strategySub}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-sm text-cream-800">
                  {strategySub}
                </td>
                <td className="px-3 py-2 text-center font-mono text-base font-semibold text-cream-900 tabular-nums">
                  {row.priority}
                </td>
                <td className="px-3 py-2 text-center font-mono text-base font-semibold text-cream-900 tabular-nums">
                  {row.product_count}
                </td>
                <td className={`px-3 py-2 font-mono text-sm ${isExpired ? 'text-cream-500 line-through' : 'text-cream-900'}`}>
                  {validity}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.avg_discount_pct != null ? (
                    <span
                      className={cn(
                        'font-mono text-base font-semibold tabular-nums',
                        row.avg_discount_pct >= 0 ? 'text-teal-700' : 'text-danger-700',
                      )}
                    >
                      {row.avg_discount_pct >= 0 ? '-' : '+'}
                      {formatNumberValue(Math.abs(row.avg_discount_pct), 'PERCENTAGE')}
                    </span>
                  ) : (
                    <span className="text-cream-400">—</span>
                  )}
                </td>
                {!isSellerAssistant ? (
                  <td className="px-3 py-2 text-right">
                    {row.avg_margin_pct != null ? (
                      <span className="font-mono text-base font-semibold tabular-nums text-cream-900">
                        {formatNumberValue(row.avg_margin_pct, 'PERCENTAGE')}
                      </span>
                    ) : (
                      <span className="text-cream-400">—</span>
                    )}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <StatusTag label={titleCaseStatus(row.status)} tone={toStatusTone(row.status)} />
                </td>
                <td className="chev px-3 py-2 pr-4 text-right text-md text-cream-500">›</td>
              </tr>
            );
          })}
        </LandingTable>
        )}
        <LandingPageLoadMore hasMore={Boolean(hasNextPage)} loading={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />
      </PageWrap>
    </>
  );
}

export function PriceListsLandingClient({
  initialData,
  initialSearch,
}: {
  initialData: PriceListsLandingResponse | null;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="PRICING_ENGINE">
      <PriceListsLandingContent initialData={initialData} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
