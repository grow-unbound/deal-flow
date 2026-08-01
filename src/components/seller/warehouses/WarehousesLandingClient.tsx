'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Package2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';

import {
  EntityAvatar,
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { WarehouseFormSheet } from '@/components/seller/warehouses/WarehouseFormSheet';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useWarehousesLanding } from '@/hooks/useWarehouses';
import { cn, formatDate, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type { WarehousesLandingResponse, WarehouseStockStatus } from '@/types/tenant-warehouses';
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
}: {
  initialData: WarehousesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = openId != null;
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('warehouses-in-operation');
  const period: SellerLandingPeriod = 'today';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-warehouses-landing',
    scopeKey: 'fixed-now',
    pathnameOverride: '/warehouses',
    version: 3,
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
    scopeKey: 'fixed-now',
    pathnameOverride: '/warehouses',
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
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(filtered.length, SELLER_INFINITE_SCROLL_RATIO),
    [filtered.length],
  );
  const hasMore = Boolean(hasNextPage);
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isFetchingNextPage,
    onLoadMore: () => {
      if (hasNextPage) {
        void fetchNextPage();
      }
    },
  });

  const kpiOptions = [
    {
      id: 'warehouses-in-operation',
      label: 'Warehouses in operation',
      value: `${summary?.kpis.active_warehouses ?? 0}`,
      sub: `of ${summary?.kpis.warehouse_count ?? 0} warehouses`,
    },
    {
      id: 'tracked-skus',
      label: 'Tracked SKUs',
      value: `${summary?.kpis.tracked_skus ?? 0}`,
      sub: 'warehouse-product rows',
    },
    {
      id: 'stock-risk',
      label: 'Warehouses with stock risk',
      value: `${summary?.kpis.low_stock_warehouses ?? 0}`,
      sub: 'need replenishment attention',
    },
    {
      id: 'idle-stock-skus',
      label: 'Idle stock SKUs',
      value: `${summary?.kpis.idle_stock_skus ?? 0}`,
      sub: 'positive stock with no recent demand',
    },
  ];
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

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

  const showRefreshingState = isLoading && !data;

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <PageHeader
          eyebrow={isPaneOpen ? 'Warehouses' : 'Inventory'}
          title={isPaneOpen ? selectedOption.label : 'Warehouses'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${summary?.kpis.warehouse_count ?? 0} warehouses across ${summary?.kpis.location_count ?? 0} locations.`}
          horizon="Now"
          primary="Add warehouse"
          onPrimaryClick={() => setSheetOpen(true)}
          compact={isPaneOpen}
        />

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
              count={`${filtered.length} warehouses`}
              searchPlaceholder="Search warehouse…"
              chips={[]}
              activeChip=""
              sortBy={routeState.sortBy}
              hideViewToggle
              compact={isPaneOpen}
              groups={groups}
              searchValue={routeState.search}
              onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
              sortOptions={[...SORT_OPTIONS]}
              onSortChange={(value) => setRouteState((current) => ({ ...current, sortBy: value as SortOption }))}
            />
          </>
        )}
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
            { label: 'Warehouse', width: 320, minWidth: 280, maxWidth: 360, className: 'px-5' },
            { label: 'Linked location', minWidth: 180, maxWidth: 220, className: 'px-5' },
            { label: 'Tracked SKUs', align: 'right', minWidth: 130, maxWidth: 150, className: 'px-5' },
            { label: 'Sellable units', align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
            { label: 'Stock risk SKUs', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Idle stock SKUs', align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1360}
          forceCompact={isPaneOpen}
          sentinelIndex={sentinelIndex}
          sentinelRef={sentinelRef}
          mobileRows={filtered.map((row) => ({
            id: row.id,
            href: `/warehouses/${row.id}`,
            primary: `${row.name}${row.is_default ? ' · Default' : ''}`,
            supporting: [row.city, row.state].filter(Boolean).join(', ') || '—',
            meta: `${row.tracked_skus} tracked SKUs`,
            trailing: `${formatNumberValue(row.sellable_units, 'COUNT')} units`,
            selected: row.id === openId,
          }))}
        >
          {filtered.map((row, index) => (
            <Fragment key={row.id}>
            {index === sentinelIndex ? (
              <tr aria-hidden="true" style={{ height: 0 }}>
                <td colSpan={7} className="p-0"><div ref={sentinelRef} /></td>
              </tr>
            ) : null}
            <tr
              onClick={() => router.push(`/warehouses/${row.id}`)}
              onPointerDown={() => triggerHaptic()}
              className={cn(
                'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
                row.id === openId ? 'bg-ember-50' : 'bg-white',
              )}
            >
              <td className="px-3 py-2">
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
              <td className="px-3 py-2 text-sm text-cream-700">{row.linked_location_name ?? '—'}</td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">{row.tracked_skus}</td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">{formatNumberValue(row.sellable_units, 'COUNT')}</td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">{row.low_stock_skus + row.stockout_skus}</td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">{row.idle_stock_skus}</td>
              <td className="px-3 py-2 text-right text-cream-500">
                <ChevronRight size={14} className="text-cream-400" />
              </td>
            </tr>
            </Fragment>
          ))}
        </LandingTable>
      )}

      <WarehouseFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingWarehouse={null} />
      </div>
    </PageWrap>
  );
}
