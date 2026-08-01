'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
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
import { SellerMobileTransactionTabs } from '@/components/seller/mobile';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import { useTenantOrders, type OrderLandingRow, type TenantOrdersResponse } from '@/hooks/useOrders';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { parseSellerLandingPeriod, type SellerLandingPeriod } from '@/lib/seller-period';
import { TableRowsSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first' | 'Order value (high → low)' | 'Items (high → low)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'Order value (high → low)', 'Items (high → low)'];
const PAGE_SIZE = 20;

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

function SalesOrdersTableRowsSkeleton() {
  return (
    <TableRowsSkeleton gridClassName="grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_0.8fr_40px]" cellCount={7} />
  );
}

function SalesOrdersDataSkeleton() {
  return (
    <>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <SalesOrdersTableRowsSkeleton />
    </>
  );
}

function SalesOrdersLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = openId != null;
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search')?.trim() || undefined;
  const clientInitialPeriod = searchParams.get('period') ? parseSellerLandingPeriod(searchParams.get('period')) : initialPeriod;
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(clientInitialPeriod);
  const summaryQuery = useTenantOrders(period, {}, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
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
      },
      sortBy: 'Recent first' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const filters = routeState.filters ?? { source: [], status: [], location_id: [] };
  const search = routeState.search;
  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching } = useTenantOrders(
    period,
    { search: debouncedSearch, ...deferredFilters },
    initialData,
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    pathnameOverride: '/sales-orders',
    ready: !isLoading,
  });
  const sortBy = routeState.sortBy;
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('order-value');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const orders = landingData?.orders ?? [];

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
  const showTableSkeleton = (isLoading || isFetching) && filteredRows.length === 0;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters.location_id, filters.source, filters.status, search, sortBy]);
  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);
  const hasMore = visibleCount < filteredRows.length;
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: false,
    onLoadMore: () => setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredRows.length)),
  });
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(visibleRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [visibleRows.length],
  );

  const pulseAggregates = summaryData?.pulse_aggregates;
  const subtitle = useMemo(() => {
    const kpis = summaryData?.kpis;
    if (!kpis) return `Sales orders ${lowerLabel} from your buyers.`;
    return `${kpis.orders_mtd} sales orders in the trailing 90 days.`;
  }, [lowerLabel, summaryData?.kpis]);

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load sales orders"
        description="There was a problem fetching the sales orders workboard. Please try again."
      />
    );
  }
  const showRefreshingState = isLoading && !landingData;

  const kpiOptions = [
    {
      id: 'order-value',
      label: 'Order value · 90D',
      value: formatNumberValue(landingData?.kpis.gmv_mtd ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${landingData?.kpis.orders_mtd ?? 0} sales orders in trailing 90 days`,
    },
    {
      id: 'open-orders',
      label: 'Open orders',
      value: formatNumberValue(landingData?.kpis.open_value ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${landingData?.kpis.open_total ?? 0} open orders`,
    },
    {
      id: 'waiting-dispatch',
      label: 'Waiting to dispatch',
      value: formatNumberValue(pulseAggregates?.waiting_dispatch_value ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${pulseAggregates?.waiting_dispatch_count ?? 0} confirmed, awaiting dispatch`,
    },
    {
      id: 'waiting-confirmation',
      label: 'Waiting for confirmation',
      value: formatNumberValue(pulseAggregates?.waiting_confirmation_value ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${pulseAggregates?.waiting_confirmation_count ?? 0} awaiting confirmation`,
    },
  ];

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
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

  return (
    <>
      <PageWrap className="max-w-[1920px] flex h-full min-h-0 flex-col">
        <StickyListHeader>
          <PageHeader
            eyebrow={isPaneOpen ? 'Sales Orders' : 'Transactions'}
            title={isPaneOpen ? selectedOption.label : 'Sales Orders'}
            subtitle={isPaneOpen ? `${selectedOption.value} · ${selectedOption.sub}` : subtitle}
            horizon={horizonLabel}
            showHorizonControl={false}
            primary={createSalesOrders ? 'Add a sales order' : undefined}
            onPrimaryClick={createSalesOrders ? () => router.push('/sales-orders/new') : undefined}
            compact={isPaneOpen}
          />
          <SellerMobileTransactionTabs active="orders" />

          {showRefreshingState || isError ? null : (
            <>
              {isPaneOpen ? null : (
                <InsightStrip4
                  tiles={kpiOptions.map((option): InsightTile => ({
                    label: option.label,
                    value: option.value,
                    sub: option.sub,
                    onClick: () => setSelectedKpiKey(option.id),
                    selected: option.id === selectedKpiKey,
                  }))}
                />
              )}

              <FilterBar
                count={`Showing ${filteredRows.length} of ${orders.length}${(isFetching || isInterim) ? ' · Updating' : ''}`}
                searchPlaceholder="Search order number…"
                chips={[]}
                activeChip=""
                sortBy={sortBy}
                hideViewToggle
                compact={isPaneOpen}
                groups={groups}
                searchValue={search}
                onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
                sortOptions={SORT_OPTIONS}
                onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
              />
            </>
          )}
        </StickyListHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {showRefreshingState ? (
          <SalesOrdersDataSkeleton />
        ) : isError ? (
          <ErrorState
            heading="Couldn't load sales orders"
            description="There was a problem fetching the sales orders workboard. Please try again."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              {showTableSkeleton ? (
                <SalesOrdersTableRowsSkeleton />
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
                    created_at: row.placed_at,
                  }))}
                  onRowClick={(row) => {
                    markSeen(row.id);
                    router.push(row.href);
                  }}
                />
              )}
            </div>
          </>
        )}
        </div>
      </PageWrap>

    </>
  );
}

export function SalesOrdersLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrders = useFlagState('SALES_ORDERS');

  if (orderManagement === false || salesOrders === false) {
    return <FeatureDisabledState />;
  }

  return <SalesOrdersLandingContent initialData={initialData} initialPeriod={initialPeriod} />;
}
