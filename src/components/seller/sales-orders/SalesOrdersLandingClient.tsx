'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Package } from 'lucide-react';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
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
type FilterChip = 'All' | 'Received' | 'Confirmed' | 'In transit' | 'Invoiced' | 'Delivered' | 'Cancelled';

const FILTER_CHIPS: FilterChip[] = ['All', 'Received', 'Confirmed', 'In transit', 'Invoiced', 'Delivered', 'Cancelled'];
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
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useTenantOrders(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    version: 2,
    initialState: {
      search: '',
      activeChip: 'All' as FilterChip,
      sortBy: 'Recent first' as SortOption,
    },
  });
  useRouteScrollRestoration({
    storageKey: 'seller-sales-orders-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const search = routeState.search;
  const activeChip = routeState.activeChip;
  const sortBy = routeState.sortBy;

  const orders = landingData?.orders ?? [];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byChip = orders.filter((row) => (activeChip === 'All' ? true : row.status.filter_chip === activeChip));
    const bySearch = byChip.filter((row) => {
      if (!query) return true;
      return (
        row.order_id.toLowerCase().includes(query) ||
        row.buyer_name.toLowerCase().includes(query) ||
        row.delivery_city.toLowerCase().includes(query) ||
        (row.catalog_name ?? '').toLowerCase().includes(query) ||
        row.source_label.toLowerCase().includes(query) ||
        row.source_detail.toLowerCase().includes(query)
      );
    });

    return bySearch.sort((a, b) => {
      if (sortBy === 'Recent first') return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
      return b.items_count - a.items_count;
    });
  }, [activeChip, orders, search, sortBy]);

  const subtitle = useMemo(() => {
    const kpis = landingData?.kpis;
    if (!kpis) return `Sales orders ${lowerLabel} from your buyers. This list is your workboard.`;
    return `${kpis.orders_mtd} sales orders ${lowerLabel} from ${kpis.buyers_mtd} buyers. ${kpis.pending_dispatch_count} pending dispatch, ${kpis.received_count} received and awaiting confirmation.`;
  }, [landingData?.kpis, lowerLabel]);
  const needsAttentionCount = useMemo(() => countNeedsAttention(orders), [orders]);
  const inMotionCount = useMemo(() => countOrdersInMotion(orders), [orders]);

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
              chips={FILTER_CHIPS}
              activeChip={activeChip}
              sortBy={sortBy}
              hideViewToggle
              searchValue={search}
              onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
              onChipChange={(chip) => setRouteState((current) => ({ ...current, activeChip: chip as FilterChip }))}
              sortOptions={SORT_OPTIONS}
              onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
            />

            <LandingTable
              showEmptyState={filteredRows.length === 0}
              emptyState={
                <EmptyState
                  icon={<Package size={28} strokeWidth={1.5} />}
                  heading={search.trim() || activeChip !== 'All' ? 'No matching sales orders' : 'No sales orders yet'}
                  description={
                    search.trim() || activeChip !== 'All'
                      ? 'Try a different search or status filter.'
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
                { label: 'Catalog', className: 'px-5' },
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
                  onClick={() => router.push(`/sales-orders/${row.id}`)}
                >
                  <td className="px-5 py-3.5 font-mono text-sm text-cream-800">{row.order_id}</td>
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
