'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
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
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSyncToTally, useTenantOrders, type OrderLandingRow, type TenantOrdersResponse } from '@/hooks/useOrders';
import { formatCompactInr, formatDate } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'Recent first' | 'GMV (high → low)' | 'Items (high → low)';
type FilterChip = 'All' | 'Confirmed' | 'In transit' | 'Delivered' | 'Hold' | 'Cancelled';

const FILTER_CHIPS: FilterChip[] = ['All', 'Confirmed', 'In transit', 'Delivered', 'Hold', 'Cancelled'];
const SORT_OPTIONS: SortOption[] = ['Recent first', 'GMV (high → low)', 'Items (high → low)'];

function mapRowToCallout(row: OrderLandingRow) {
  return {
    initials: row.buyer_initials,
    hue: row.buyer_hue,
    name: row.buyer_name,
  };
}

function OrdersLoadingSkeleton() {
  return (
    <PageWrap>
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

function OrdersLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, lowerLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useTenantOrders(period, initialData);
  const syncMutation = useSyncToTally();

  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<FilterChip>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Recent first');
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);

  const orders = data?.orders ?? [];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byChip = orders.filter((row) => (activeChip === 'All' ? true : row.status.filter_chip === activeChip));
    const bySearch = byChip.filter((row) => {
      if (!query) return true;
      return (
        row.order_id.toLowerCase().includes(query) ||
        row.buyer_name.toLowerCase().includes(query) ||
        row.delivery_city.toLowerCase().includes(query)
      );
    });

    return bySearch.sort((a, b) => {
      if (sortBy === 'Recent first') return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
      if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
      return b.items_count - a.items_count;
    });
  }, [activeChip, orders, search, sortBy]);

  const subtitle = useMemo(() => {
    const kpis = data?.kpis;
    if (!kpis) return `Orders ${lowerLabel} from your buyers. This list is your workboard.`;
    return `${kpis.orders_mtd} orders ${lowerLabel} from ${kpis.buyers_mtd} buyers. ${kpis.pending_dispatch_count} pending dispatch, ${kpis.on_hold_count} on hold, ${kpis.delivered_count} already delivered. The list is your workboard.`;
  }, [data?.kpis, lowerLabel]);

  if (isLoading) return <OrdersLoadingSkeleton />;

  if (isError || !data) {
    return (
      <ErrorState
        heading="Couldn't load orders"
        description="There was a problem fetching the orders workboard. Please try again."
      />
    );
  }

  return (
    <>
      <PageWrap>
        <PageHeader
          eyebrow="Transactions"
          title="Orders"
          subtitle={subtitle}
          horizon={horizonLabel}
          period={period}
          periodOptions={options}
          onPeriodChange={setPeriod}
          secondary={{
            label: syncMutation.isPending ? 'Syncing…' : 'Sync to Tally',
            icon: <RefreshCw size={13} className={syncMutation.isPending ? 'animate-spin' : undefined} />,
            onClick: () => syncMutation.mutate(),
          }}
          primary="Record an order"
          onPrimaryClick={() => setRecordDialogOpen(true)}
        />

        <InsightStrip4
          tiles={[
            {
              label: `Orders · ${metricSuffix}`,
              value: `${data.kpis.orders_mtd}`,
              sub: `${data.kpis.orders_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(data.kpis.orders_growth_pct)}% vs last month`,
            },
            {
              label: `GMV · ${metricSuffix}`,
              value: formatCompactInr(data.kpis.gmv_mtd),
              sub: `AOV ${formatCompactInr(data.kpis.aov)}`,
              tone: 'accent',
            },
            {
              label: 'Pending dispatch',
              value: `${data.kpis.pending_dispatch_count}`,
              sub: 'awaiting confirmation',
              tone: 'warn',
            },
            {
              label: 'On hold',
              value: `${data.kpis.on_hold_count}`,
              sub: 'credit limit issue',
            },
          ]}
        />

        <V3CalloutPanel
          items={[
            {
              kind: 'risk',
              eyebrow: 'Needs attention',
              hint: `${data.todays_read.needs_attention.length}`,
              rows: data.todays_read.needs_attention.map((row) => ({
                ...mapRowToCallout(row),
                reason: `${row.order_id} · ${row.status.label} · ${row.delivery_city}`,
                trailing: row.status.label,
              })),
            },
            {
              kind: 'info',
              eyebrow: 'Biggest tickets',
              hint: lowerLabel,
              rows: data.todays_read.biggest_tickets.map((row) => ({
                ...mapRowToCallout(row),
                reason: `${row.order_id} · ${row.items_count} items · ${row.delivery_city}`,
                trailing: formatCompactInr(row.gmv),
              })),
            },
            {
              kind: 'opportunity',
              eyebrow: 'In motion',
              hint: 'dispatching now',
              rows: data.todays_read.in_motion.map((row) => ({
                ...mapRowToCallout(row),
                reason: `${row.order_id} · ${row.delivery_city} · ${formatCompactInr(row.gmv)}`,
                trailing: row.status.label,
              })),
            },
          ]}
        />

        <FilterBar
          count={`Showing ${filteredRows.length} of ${orders.length}`}
          searchPlaceholder="Search order ID, buyer, city…"
          chips={FILTER_CHIPS}
          activeChip={activeChip}
          sortBy={sortBy}
          hideViewToggle
          searchValue={search}
          onSearchChange={setSearch}
          onChipChange={(chip) => setActiveChip(chip as FilterChip)}
          sortOptions={SORT_OPTIONS}
          onSortChange={(option) => setSortBy(option as SortOption)}
        />

        <LandingTable
          columns={[
            { label: 'Order', className: 'px-5' },
            { label: 'Buyer', className: 'px-5' },
            { label: 'Delivery', className: 'px-5' },
            { label: 'Items', align: 'right', className: 'px-5' },
            { label: 'GMV', align: 'right', className: 'px-5' },
            { label: 'Status', className: 'px-5' },
            { label: 'Placed', className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
        >
          {filteredRows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/orders/${row.id}`)}
            >
              <td className="px-5 py-3.5 font-mono text-[12px] text-cream-800">{row.order_id}</td>
              <td className="px-5 py-3.5 text-[13px] text-cream-900">
                <div className="ent flex items-center gap-3">
                  <EntityAvatar initials={row.buyer_initials} hue={row.buyer_hue} size={30} />
                  <p className="truncate text-[13px] font-medium text-cream-900">{row.buyer_name}</p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-[12.5px] text-cream-900">{row.delivery_label}</td>
              <td className="px-5 py-3.5 text-right font-mono text-[13px] text-cream-900">{row.items_count}</td>
              <td className="px-5 py-3.5 text-right">
                <span className="font-display text-[15px] font-medium text-cream-900 tabular-nums">{formatCompactInr(row.gmv)}</span>
              </td>
              <td className="px-5 py-3.5">
                <StatusTag label={row.status.label} tone={row.status.tone} />
              </td>
              <td className="px-5 py-3.5 font-mono text-[12px] text-cream-700">{formatDate(row.placed_at)}</td>
              <td className="chev px-4 py-3.5 pr-4 text-right text-[16px] text-cream-500">›</td>
            </tr>
          ))}
        </LandingTable>
      </PageWrap>

      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Record an order</DialogTitle>
            <DialogDescription>
              Order capture flow will be connected in EP-08. This shell is ready for the full form.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-[13px] leading-[1.55] text-cream-700">
              Use this entry point to manually record seller-side orders once the complete workflow is implemented.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OrdersLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: TenantOrdersResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="ORDER_MANAGEMENT">
      <OrdersLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
