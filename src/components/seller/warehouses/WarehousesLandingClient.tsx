'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Package2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WarehouseFormSheet } from '@/components/seller/warehouses/WarehouseFormSheet';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useWarehousesLanding } from '@/hooks/useWarehouses';
import { formatDate } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type { WarehousesLandingResponse, WarehouseStockStatus } from '@/types/tenant-warehouses';
import { WarehousesLandingSkeleton as SharedWarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingPageLoadMore } from '@/components/seller/layout/LandingPageLoadMore';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';

type SortOption = 'Tracked SKUs (high → low)' | 'Sellable units (high → low)' | 'Idle stock SKUs (high → low)';

const STATUS_OPTIONS = ['Active', 'Inactive'] as const;
const STOCK_OPTIONS = ['In Stock', 'Low Stock', 'Out of Stock'] as const;
const SORT_OPTIONS: SortOption[] = [
  'Tracked SKUs (high → low)',
  'Sellable units (high → low)',
  'Idle stock SKUs (high → low)',
];

function WarehousesLandingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-[34rem]" />
        </div>
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
        <Skeleton className="h-[320px] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function stockTone(status: WarehouseStockStatus): 'success' | 'warning' | 'danger' {
  if (status === 'out_of_stock') return 'danger';
  if (status === 'low_stock') return 'warning';
  return 'success';
}

function stockLabel(status: WarehouseStockStatus) {
  if (status === 'out_of_stock') return 'Out of stock';
  if (status === 'low_stock') return 'Low stock';
  return 'Clear';
}

export function WarehousesLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: WarehousesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { period, setPeriod, horizonLabel, options } = useSellerLandingPeriod(initialPeriod);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-warehouses-landing',
    scopeKey: period,
    version: 2,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
        stock: [] as string[],
      },
      sortBy: 'Tracked SKUs (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });

  const filters = routeState.filters ?? { status: [], stock: [] };
  const hasTableControls = Boolean(routeState.search.trim() || filters.status.length > 0 || filters.stock.length > 0);
  const { data, isLoading, isError, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useWarehousesLanding(
    period,
    {
      search: routeState.search,
      status: filters.status,
      stock: filters.stock,
    },
    initialData,
  );
  const summaryData = useRetainedValue<WarehousesLandingResponse | undefined>(
    !hasTableControls ? data : initialData ?? undefined,
  );

  useRouteScrollRestoration({
    storageKey: 'seller-warehouses-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  const groups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.status,
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filters: { ...(current.filters ?? filters), status: values },
        })),
    },
    {
      key: 'stock',
      label: 'Stock',
      options: STOCK_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.stock,
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filters: { ...(current.filters ?? filters), stock: values },
        })),
    },
  ];

  const filtered = useMemo(() => {
    const rows = [...(data?.warehouses ?? [])];
    if (routeState.sortBy === 'Sellable units (high → low)') {
      rows.sort((a, b) => b.sellable_units - a.sellable_units);
    } else if (routeState.sortBy === 'Idle stock SKUs (high → low)') {
      rows.sort((a, b) => b.idle_stock_skus - a.idle_stock_skus);
    } else {
      rows.sort((a, b) => b.tracked_skus - a.tracked_skus);
    }
    return rows;
  }, [data?.warehouses, routeState.sortBy]);
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filtered.length === 0;
  const summary = summaryData ?? data;

  if (isLoading && !data) return <SharedWarehousesLandingSkeleton />;
  if (isError && !data) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load warehouses"
          description="There was a problem fetching your warehouses. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }
  if (!data) return <SharedWarehousesLandingSkeleton />;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Inventory"
        title="Warehouses"
        subtitle="Track stock nodes, identify idle inventory, and manage warehouse-level inventory posture."
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Add warehouse"
        onPrimaryClick={() => setSheetOpen(true)}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Active warehouses',
            value: `${summary?.kpis.active_warehouses ?? 0}`,
            sub: `${summary?.kpis.active_warehouses ?? 0} total`,
          },
          {
            label: 'Tracked SKUs',
            value: `${summary?.kpis.tracked_skus ?? 0}`,
            sub: 'warehouse-product rows',
          },
          {
            label: 'Low-stock warehouses',
            value: `${summary?.kpis.low_stock_warehouses ?? 0}`,
            sub: 'need replenishment attention',
            tone: (summary?.kpis.low_stock_warehouses ?? 0) > 0 ? 'warn' : undefined,
          },
          {
            label: 'Idle stock SKUs',
            value: `${summary?.kpis.idle_stock_skus ?? 0}`,
            sub: 'positive stock with no recent demand',
            tone: (summary?.kpis.idle_stock_skus ?? 0) > 0 ? 'warn' : undefined,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Stock attention',
            hint: `${summary?.callouts.stock_attention.length ?? 0} warehouses`,
            rows: (summary?.callouts.stock_attention ?? []).map((row) => ({
              initials: row.initials,
              hue: 'ember' as const,
              name: row.name,
              reason: `${row.value} low / stockout SKUs`,
              trailing: <StatusTag tone="warning" label="Review" />,
            })),
          },
          {
            kind: 'risk',
            eyebrow: 'Idle stock',
            hint: `${summary?.callouts.idle_stock.length ?? 0} warehouses`,
            rows: (summary?.callouts.idle_stock ?? []).map((row) => ({
              initials: row.initials,
              hue: 'ember' as const,
              name: row.name,
              reason: `${row.value} idle SKUs`,
              trailing: <StatusTag tone="warning" label="Idle" />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Recently replenished',
            hint: 'latest inventory updates',
            rows: (summary?.callouts.recently_replenished ?? []).map((row) => ({
              initials: row.initials,
              hue: 'teal' as const,
              name: row.name,
              reason: row.last_updated ? `Updated ${formatDate(row.last_updated)}` : 'Recently updated',
              trailing: `${row.value} tracked SKUs`,
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} warehouses`}
        searchPlaceholder="Search warehouse…"
        chips={[]}
        activeChip=""
        sortBy={routeState.sortBy}
        hideViewToggle
        groups={groups}
        searchValue={routeState.search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(value) => setRouteState((current) => ({ ...current, sortBy: value as SortOption }))}
      />

      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={9} tableMinWidth={1360} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package2 size={28} strokeWidth={1.5} />}
          heading={routeState.search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching warehouses' : 'No warehouses yet'}
          description={
            routeState.search.trim() || groups.some((group) => group.values.length > 0)
              ? 'Try a different search or filter.'
              : 'Add your first warehouse to start tracking stock at the warehouse level.'
          }
        />
      ) : (
        <LandingTable
          columns={[
            { label: 'Warehouse', minWidth: 280, maxWidth: 360, className: 'px-5' },
            { label: 'Linked location', minWidth: 180, maxWidth: 220, className: 'px-5' },
            { label: 'Status', minWidth: 130, maxWidth: 160, className: 'px-5' },
            { label: 'Tracked SKUs', align: 'right', minWidth: 130, maxWidth: 150, className: 'px-5' },
            { label: 'Sellable units', align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
            { label: 'Low stock', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Idle stock SKUs', align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
            { label: 'Last updated', minWidth: 130, maxWidth: 160, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1360}
        >
          {filtered.map((row) => (
            <tr
              key={row.id}
              onClick={() => router.push(`/warehouses/${row.id}`)}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <EntityAvatar size={38} initials={row.initials} hue="teal" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">
                      {row.name}
                      {row.is_default ? ' · Default' : ''}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-cream-600">
                      {[row.city, row.state].filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-cream-700">{row.linked_location_name ?? '—'}</td>
              <td className="px-5 py-3.5">
                <StatusTag tone={stockTone(row.stock_status)} label={`${row.status === 'active' ? 'Active' : 'Inactive'} · ${stockLabel(row.stock_status)}`} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">{row.tracked_skus}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">{row.sellable_units.toLocaleString('en-IN')}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">{row.low_stock_skus + row.stockout_skus}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">{row.idle_stock_skus}</td>
              <td className="px-5 py-3.5 text-sm text-cream-700">{formatDate(row.last_updated)}</td>
              <td className="px-4 py-3.5 text-right text-cream-500">
                <ChevronRight size={14} className="text-cream-400" />
              </td>
            </tr>
          ))}
        </LandingTable>
      )}

      <LandingPageLoadMore hasMore={Boolean(hasNextPage)} loading={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

      <WarehouseFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingWarehouse={null} />
    </PageWrap>
  );
}
