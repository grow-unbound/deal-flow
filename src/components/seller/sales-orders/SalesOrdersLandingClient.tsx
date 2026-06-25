'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Package } from 'lucide-react';
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
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantOrders, type OrderLandingRow, type TenantOrdersResponse } from '@/hooks/useOrders';
import { formatCompactInr, formatDate, formatInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'Recent first' | 'GMV (high → low)' | 'Items (high → low)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'GMV (high → low)', 'Items (high → low)'];

function mapRowToCallout(row: OrderLandingRow) {
  return {
    initials: row.buyer_initials,
    hue: row.buyer_hue,
    name: row.buyer_name,
  };
}

function buyerGeographyLabel(row: OrderLandingRow) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function countNeedsAttention(rows: OrderLandingRow[]) {
  return rows.filter((row) => row.status.value === 'received').length;
}

function countOrdersInMotion(rows: OrderLandingRow[]) {
  return rows.filter((row) => row.status.value === 'dispatched' || row.status.value === 'partially_dispatched').length;
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
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { newEntityIds, markSeen } = useSellerRealtimeContext();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const summaryQuery = useTenantOrders(period, {}, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    version: 3,
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
  const filters = routeState.filters ?? { source: [], status: [], location_id: [] };
  const { data, isLoading, isError } = useTenantOrders(period, { search: routeState.search, ...filters }, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const search = routeState.search;
  const sortBy = routeState.sortBy;

  const summaryOrders = summaryData?.orders ?? [];
  const orders = landingData?.orders ?? [];

  const filteredRows = useMemo(() => {
    return [...orders].sort((a, b) => {
      if (sortBy === 'Recent first') return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
      return b.items_count - a.items_count;
    });
  }, [orders, sortBy]);

  const subtitle = useMemo(() => {
    const kpis = summaryData?.kpis;
    if (!kpis) return `Sales orders ${lowerLabel} from your buyers. This list is your workboard.`;
    return `${kpis.orders_mtd} sales orders ${lowerLabel} from ${kpis.buyers_mtd} buyers. ${kpis.pending_dispatch_count} pending dispatch, ${kpis.received_count} received and awaiting confirmation.`;
  }, [lowerLabel, summaryData?.kpis]);
  const needsAttentionCount = useMemo(() => countNeedsAttention(summaryOrders), [summaryOrders]);
  const inMotionCount = useMemo(() => countOrdersInMotion(summaryOrders), [summaryOrders]);

  if (isLoading && !landingData) return <SalesOrdersLoadingSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load sales orders"
        description="There was a problem fetching the sales orders workboard. Please try again."
      />
    );
  }
  if (!landingData) return <SalesOrdersLoadingSkeleton />;
  const showRefreshingState = isLoading && !data;
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
          eyebrow="Transactions"
          title="Sales Orders"
          subtitle={subtitle}
          horizon={horizonLabel}
          period={period}
          periodOptions={options}
          onPeriodChange={setPeriod}
          primary="Add a sales order"
          onPrimaryClick={() => router.push('/sales-orders/new')}
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
                  label: 'Sales Orders · MTD',
                  value: `${landingData.kpis.orders_mtd}`,
                  sub: `${landingData.kpis.orders_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(landingData.kpis.orders_growth_pct)}% vs last month`,
                },
                {
                  label: 'GMV',
                  value: formatCompactInr(landingData.kpis.gmv_mtd),
                  sub: `AOV ${formatCompactInr(landingData.kpis.aov)}`,
                  tone: 'accent',
                },
                {
                  label: 'Pending dispatch',
                  value: `${landingData.kpis.pending_dispatch_count}`,
                  sub: 'confirmed, awaiting dispatch',
                  tone: 'warn',
                },
                {
                  label: 'Received',
                  value: `${landingData.kpis.received_count}`,
                  sub: 'awaiting confirmation',
                },
              ]}
            />

            <V3CalloutPanel
              items={[
                {
                  kind: 'risk',
                  eyebrow: 'Needs action',
                  hint: `${needsAttentionCount}`,
                  rows: landingData.todays_read.needs_attention.map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.order_id} · ${row.status.label} · ${row.delivery_city}`,
                    trailing: (
                      <span className="inline-flex font-sans">
                        <StatusTag label={row.status.label} tone={row.status.tone} />
                      </span>
                    ),
                  })),
                },
                {
                  kind: 'info',
                  eyebrow: 'Biggest tickets',
                  hint: `${orders.length}`,
                  rows: landingData.todays_read.biggest_tickets.map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.order_id} · ${row.items_count} items · ${row.delivery_city}`,
                    trailing: formatCompactInr(row.total_amount),
                  })),
                },
                {
                  kind: 'opportunity',
                  eyebrow: 'In motion',
                  hint: `${inMotionCount}`,
                  rows: landingData.todays_read.in_motion.map((row) => ({
                    ...mapRowToCallout(row),
                    reason: `${row.order_id} · ${row.delivery_city} · ${formatCompactInr(row.total_amount)}`,
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
              count={`Showing ${filteredRows.length} of ${orders.length}`}
              searchPlaceholder="Search order ID, buyer, city, catalog…"
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
                  icon={<Package size={28} strokeWidth={1.5} />}
                  heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching sales orders' : 'No sales orders yet'}
                  description={
                    search.trim() || groups.some((group) => group.values.length > 0)
                      ? 'Try a different search or filter combination.'
                      : 'Create a sales order to track fulfilment.'
                  }
                  action={
                    <Button variant="accent" asChild>
                      <Link href="/sales-orders/new" className="inline-flex items-center gap-1.5">
                        <Plus size={13} />
                        Add a sales order
                      </Link>
                    </Button>
                  }
                />
              }
              tableClassName="v2-table"
              columns={[
                { label: 'Order', className: 'px-5' },
                { label: 'Buyer', className: 'px-5' },
                { label: 'Source', className: 'px-5' },
                { label: 'Location', className: 'px-5' },
                { label: 'Campaign', className: 'px-5' },
                { label: 'Delivery', className: 'px-5' },
                { label: 'Items', align: 'right', className: 'px-5' },
                { label: 'Total Amount', align: 'right', className: 'px-5' },
                { label: 'Status', className: 'px-5' },
                { label: 'Placed', className: 'px-5' },
                { width: 40, className: 'px-4' },
              ]}
            >
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                  onClick={() => { markSeen(row.id); router.push(`/sales-orders/${row.id}`); }}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-cream-800">{row.order_id}</span>
                      {newEntityIds.has(row.id) && <RealtimeBadge type="new" />}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-base text-cream-900">
                    <div className="ent flex items-center gap-3">
                      <EntityAvatar initials={row.buyer_initials} hue={row.buyer_hue} size={30} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-cream-900">{row.buyer_name}</p>
                        <p className="mt-0.5 truncate text-xs text-cream-600">{buyerGeographyLabel(row)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="truncate text-sm text-cream-900">{row.source_label}</p>
                    <p className="mt-0.5 truncate text-xs text-cream-600">{row.source_detail}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-cream-900">{row.location_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-cream-900">{row.catalog_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-cream-900">{row.delivery_label}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.items_count}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-sm text-cream-900">{formatInr(row.total_amount)}</td>
                  <td className="px-5 py-3.5">
                    <StatusTag label={row.status.label} tone={row.status.tone} />
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm text-cream-700">{formatDate(row.placed_at)}</td>
                  <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
                </tr>
              ))}
            </LandingTable>
          </>
        )}
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
