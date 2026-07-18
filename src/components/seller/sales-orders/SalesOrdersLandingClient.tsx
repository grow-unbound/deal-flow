'use client';

import { useDeferredValue, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  V3CalloutPanel,
} from '@/components/seller/layout';
import { TransactionTable } from '@/components/seller/transactional';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import { useTenantOrders, type OrderLandingRow, type TenantOrdersResponse } from '@/hooks/useOrders';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCompactInr, formatDate, formatInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { SalesOrdersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first' | 'GMV (high → low)' | 'Items (high → low)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'GMV (high → low)', 'Items (high → low)'];

function mapRowToCallout(row: Pick<OrderLandingRow, 'id' | 'buyer_initials' | 'buyer_hue' | 'buyer_name'>) {
  return {
    id: row.id,
    initials: row.buyer_initials,
    hue: row.buyer_hue,
    name: row.buyer_name,
  };
}

function buyerGeographyLabel(row: OrderLandingRow) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function matchesOrderSearch(row: OrderLandingRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.order_id,
    row.buyer_name,
    row.location_name,
    row.source_label,
    row.campaign_name ?? null,
    row.catalog_name ?? null,
    row.place_of_supply ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function SalesOrdersLoadingSkeleton() {
  return (
    <PageWrap className="max-w-[1920px]">
      <div className="h-24 animate-pulse rounded-[12px] bg-cream-100" />
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

function SalesOrdersDataSkeleton() {
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

function SalesOrdersLandingContent({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const summaryQuery = useTenantOrders(period, {}, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { createSalesOrders } = useCreateFlags();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-sales-orders-landing',
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
    ready: !isLoading,
  });
  const sortBy = routeState.sortBy;

  const orders = landingData?.orders ?? [];

  const filteredRows = useMemo(() => {
    return orders
      .filter((row) => {
        if (!matchesOrderSearch(row, search)) {
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
      if (sortBy === 'Recent first') return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
      return b.items_count - a.items_count;
    });
  }, [filters.location_id, filters.source, filters.status, orders, search, sortBy]);
  const showTableSkeleton = (isLoading || isFetching) && filteredRows.length === 0;

  const subtitle = useMemo(() => {
    const kpis = summaryData?.kpis;
    if (!kpis) return `Sales orders ${lowerLabel} from your buyers.`;
    return `${kpis.orders_mtd} sales orders in ${horizonLabel.toLowerCase()}.`;
  }, [horizonLabel, lowerLabel, summaryData?.kpis]);
  const pulseAggregates = summaryData?.pulse_aggregates;

  if (isLoading && !landingData) return <SalesOrdersLandingSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load sales orders"
        description="There was a problem fetching the sales orders workboard. Please try again."
      />
    );
  }
  if (!landingData) return <SalesOrdersLandingSkeleton />;
  const showRefreshingState = isLoading && !data;
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
          eyebrow="Transactions"
          title="Sales Orders"
          subtitle={subtitle}
          horizon={horizonLabel}
          showHorizonControl={false}
          primary={createSalesOrders ? 'Add a sales order' : undefined}
          onPrimaryClick={createSalesOrders ? () => router.push('/sales-orders/new') : undefined}
        />

        {showRefreshingState ? (
          <SalesOrdersDataSkeleton />
        ) : isError ? (
          <ErrorState
            heading="Couldn't load sales orders"
            description="There was a problem fetching the sales orders workboard. Please try again."
          />
        ) : (
          <>
            <InsightStrip4
              tiles={[
                {
                  label: 'Order value created',
                  value: formatCompactInr(landingData.kpis.gmv_mtd),
                  sub: `${landingData.kpis.orders_mtd} sales orders this month`,
                },
                {
                  label: 'Open orders',
                  value: formatCompactInr(landingData.kpis.open_value),
                  sub: `${landingData.kpis.open_total} open orders`,
                  tone: 'accent',
                },
                {
                  label: 'Waiting to dispatch',
                  value: formatCompactInr(pulseAggregates?.waiting_dispatch_value ?? 0),
                  sub: `${pulseAggregates?.waiting_dispatch_count ?? 0} confirmed, awaiting dispatch`,
                  tone: 'warn',
                },
                {
                  label: 'Waiting for confirmation',
                  value: formatCompactInr(pulseAggregates?.waiting_confirmation_value ?? 0),
                  sub: `${pulseAggregates?.waiting_confirmation_count ?? 0} awaiting confirmation`,
                },
              ]}
            />

            <V3CalloutPanel
              items={[
                {
                  id: 'needs_attention',
                  kind: 'risk',
                  eyebrow: 'Orders to confirm',
                  hint: `${landingData.kpis.received_count}`,
                  getHref: (row) => `/sales-orders/${row.id}`,
                  rows: landingData.todays_read.needs_attention.map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.order_id} · ${formatDate(row.placed_at)}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  id: 'to_dispatch',
                  kind: 'info',
                  eyebrow: 'Orders to dispatch',
                  hint: `${landingData.kpis.pending_dispatch_count}`,
                  getHref: (row) => `/sales-orders/${row.id}`,
                  rows: landingData.todays_read.to_dispatch.map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.order_id} · Confirmed ${row.confirmed_at ? formatDate(row.confirmed_at) : '—'}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  id: 'stock_shortage',
                  kind: 'opportunity',
                  eyebrow: 'Stock shortage',
                  hint: `${landingData.todays_read.stock_shortage.length}`,
                  getHref: (row) => `/sales-orders/${row.id}`,
                  rows: landingData.todays_read.stock_shortage.map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.order_id} · Confirmed ${row.confirmed_at ? formatDate(row.confirmed_at) : '—'}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
              ]}
            />

            <FilterBar
              count={`Showing ${filteredRows.length} of ${orders.length}${(isFetching || isInterim) ? ' · Updating' : ''}`}
              searchPlaceholder="Search order number…"
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
                <SalesOrdersDataSkeleton />
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
                  rows={filteredRows.map((row) => ({
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
      </PageWrap>

    </>
  );
}

export function SalesOrdersLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrders = useFlagState('SALES_ORDERS');

  if (orderManagement === false || salesOrders === false) {
    return <FeatureDisabledState />;
  }

  return <SalesOrdersLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />;
}
