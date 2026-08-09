'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Package } from 'lucide-react';
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
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import {
  useTenantOrders,
  useTenantOrdersInfinite,
  useTenantOrdersMetrics,
  type OrderLandingRow,
  type OrdersLandingKpiCardV4,
  type OrdersLandingMetricsV4,
  type TenantOrdersResponse,
} from '@/hooks/useOrders';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { formatNumberValue } from '@/lib/utils';
import { ORDERS_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { parseSellerLandingPeriod, type SellerLandingPeriod } from '@/lib/seller-period';
import { SalesOrdersLandingSkeleton, TableRowsSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first' | 'Order value (high → low)' | 'Items (high → low)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'Order value (high → low)', 'Items (high → low)'];

function buyerGeographyLabel(row: OrderLandingRow) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function orderSourceFilterLabel(row: OrderLandingRow) {
  if (row.source_kind === 'converted') return 'Converted Estimate';
  if (row.source_kind === 'buyer_app') return 'Buyer App';
  return 'Direct';
}

function matchesOrderSearch(row: OrderLandingRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.order_id,
    row.buyer_name,
    row.location_name,
    row.source_label,
    row.source_detail,
    row.campaign_name ?? null,
    row.catalog_name ?? null,
    row.place_of_supply ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function filtersFromOrderPreset(preset: Record<string, unknown> | null | undefined) {
  if (!preset) return {
    source: [] as string[],
    status: [] as string[],
    location_id: [] as string[],
    attention: [] as string[],
  };
  return {
    source: [] as string[],
    status: preset.status === 'open'
      ? ['Received', 'Confirmed', 'In transit']
      : preset.status === 'received'
        ? ['Received']
        : preset.status === 'confirmed'
          ? ['Confirmed']
          : [],
    location_id: [] as string[],
    attention: preset.status === 'confirmed' && Number(preset.age_gte_days ?? 0) >= 3 ? ['awaiting_dispatch_3d'] : [],
  };
}

function periodFromOrderPreset(preset: Record<string, unknown> | null | undefined): SellerLandingPeriod | null {
  if (!preset || typeof preset.date_period !== 'string') return null;
  if (preset.date_period === 'today') return 'today';
  if (preset.date_period === 'this_week') return 'week';
  if (preset.date_period === 'this_quarter') return 'quarter';
  if (preset.date_period === 'this_month') return 'month';
  return null;
}

function asOrdersMetrics(data: OrdersLandingMetricsV4 | TenantOrdersResponse | null | undefined): OrdersLandingMetricsV4 | null {
  if (data && 'cards' in data && Array.isArray(data.cards)) return data;
  return null;
}

function SalesOrdersLandingContent({
  initialMetrics,
  initialPeriod,
}: {
  initialMetrics: OrdersLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/sales-orders');
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search')?.trim() || undefined;
  const clientInitialPeriod = searchParams.get('period') ? parseSellerLandingPeriod(searchParams.get('period')) : initialPeriod;
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(clientInitialPeriod);
  const metricsQuery = useTenantOrdersMetrics(period, initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { createSalesOrders } = useCreateFlags();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    pathnameOverride: '/sales-orders',
    version: 4,
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
  const filters = routeState.filters ?? { source: [], status: [], location_id: [], attention: [] };
  const filterPreset = routeState.filterPreset ?? null;
  const search = routeState.search;
  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantOrdersInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters, filter_preset: filterPreset },
  );
  useRouteScrollRestoration({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    pathnameOverride: '/sales-orders',
    ready: !isLoading,
  });
  const sortBy = routeState.sortBy;
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const firstPage = data?.pages?.[0];
  const orders = useMemo(() => data?.pages?.flatMap((page) => page.orders) ?? [], [data?.pages]);

  const filteredRows = useMemo(() => {
    return orders
      .filter((row) => {
        if (!matchesOrderSearch(row, search)) {
          return false;
        }

        if (filters.source.length > 0 && !filters.source.includes(orderSourceFilterLabel(row))) {
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
      if (sortBy === 'Recent first') return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      if (sortBy === 'Order value (high → low)') return b.gmv - a.gmv;
      return b.items_count - a.items_count;
    });
  }, [filters.location_id, filters.source, filters.status, orders, search, sortBy]);
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filteredRows.length === 0;
  const visibleRows = filteredRows;
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    onLoadMore: fetchNextPage,
  });
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(visibleRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [visibleRows.length],
  );

  const subtitle = useMemo(() => {
    return `Sales orders ${lowerLabel} from your buyers.`;
  }, [lowerLabel]);

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load sales orders"
        description="There was a problem fetching the sales orders workboard. Please try again."
      />
    );
  }
  const showRefreshingState = isLoading && !data;

  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading sales orders" showTransactionTabs variant="transaction" />
    ) : (
      <SalesOrdersLandingSkeleton />
    );
  }

  const kpiOptions = (metricsData?.cards ?? []).map((card: OrdersLandingKpiCardV4) => ({
    id: card.id,
    label: kpiLabel(ORDERS_KPI_COPY, card),
    value: formatNumberValue(Number(card.value ?? 0), 'CURRENCY_THRESHOLD'),
    sub: kpiSupportingText(ORDERS_KPI_COPY, card),
    filterPreset: card.filter_preset ?? null,
  }));

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
  const selectedOption = selectedKpiKey ? kpiOptions.find((option) => option.id === selectedKpiKey) ?? null : null;

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
            eyebrow={isPaneOpen ? 'Sales Orders' : 'Transactions'}
            title={isPaneOpen ? selectedOption?.label ?? 'Sales Orders' : 'Sales Orders'}
            subtitle={isPaneOpen && selectedOption ? `${selectedOption.value} · ${selectedOption.sub}` : subtitle}
            horizon={horizonLabel}
            showHorizonControl={false}
            primary={createSalesOrders ? 'Add a sales order' : undefined}
            onPrimaryClick={createSalesOrders ? () => router.push('/sales-orders/new') : undefined}
            compact={isPaneOpen}
          />
          <SellerMobileTransactionTabs active="orders" />

          {isPaneOpen ? null : (
            <InsightStrip4
              tiles={kpiOptions.map((option): InsightTile => ({
                label: option.label,
                value: option.value,
                sub: option.sub,
                onClick: () => {
                  setSelectedKpiKey(option.id);
                  const presetPeriod = periodFromOrderPreset(option.filterPreset);
                  if (presetPeriod && presetPeriod !== period) setPeriod(presetPeriod);
                  setRouteState((current) => ({
                    ...current,
                    filterPreset: option.filterPreset,
                    filters: filtersFromOrderPreset(option.filterPreset),
                  }));
                },
                selected: option.id === selectedKpiKey,
              }))}
            />
          )}

          <FilterBar
            count={`Showing ${filteredRows.length} of ${(firstPage as { total?: number | null } | undefined)?.total ?? orders.length}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
            searchPlaceholder="Search order number…"
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
            heading="Couldn't load sales orders"
            description="There was a problem fetching the sales orders workboard. Please try again."
          />
        ) : (
          <>
            {showTableSkeleton ? (
              isPaneOpen ? (
                <SplitPaneListRowsSkeleton isPaneOpen variant="transaction" />
              ) : (
                <TableRowsSkeleton gridClassName="grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_0.8fr_40px]" cellCount={7} />
              )
            ) : filteredRows.length === 0 ? (
              <EmptyState
                icon={<Package size={28} strokeWidth={1.5} />}
                heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching sales orders' : 'No sales orders yet'}
                description={
                  search.trim() || groups.some((group) => group.values.length > 0)
                    ? 'Try a different search or filter combination.'
                    : 'Create a sales order to track fulfilment.'
                }
                action={
                  createSalesOrders ? (
                    <Button variant="accent" asChild>
                      <Link href="/sales-orders/new" className="inline-flex items-center gap-1.5">
                        <Plus size={13} />
                        Add a sales order
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <TransactionTable
                kind="order"
                showCampaignColumn={showCampaignColumn}
                tableMinWidth={showCampaignColumn ? 1380 : 1180}
                forceCompact={isPaneOpen}
                selectedId={openId}
                sentinelIndex={sentinelIndex}
                sentinelRef={sentinelRef}
                rows={visibleRows.map((row) => ({
                  id: row.id,
                  href: `/sales-orders/${row.id}`,
                  document_number: row.order_id,
                  is_buyer_app: row.source_kind === 'buyer_app' || row.source_detail === 'BUYER_APP',
                  realtime_badge: newEntityIds.has(row.id) ? 'new' : undefined,
                  source_kind: row.source_kind,
                  source_label: row.source_kind === 'converted' ? row.source_label : null,
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
                  created_at: row.placed_at,
                }))}
                onRowClick={(row) => {
                  markSeen(row.id);
                  router.push(row.href);
                }}
              />
            )}
          </>
        )}
        </div>
      </PageWrap>

    </>
  );
}

export function SalesOrdersLandingClient({
  initialMetrics,
  initialData,
  initialPeriod,
}: {
  initialMetrics?: OrdersLandingMetricsV4 | null;
  initialData?: OrdersLandingMetricsV4 | TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrders = useFlagState('SALES_ORDERS');

  if (orderManagement === false || salesOrders === false) {
    return <FeatureDisabledState />;
  }

  return <SalesOrdersLandingContent initialMetrics={initialMetrics ?? asOrdersMetrics(initialData)} initialPeriod={initialPeriod} />;
}
