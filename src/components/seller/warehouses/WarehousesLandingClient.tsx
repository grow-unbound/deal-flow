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
import { WarehouseFormSheet } from '@/components/seller/warehouses/WarehouseFormSheet';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useWarehousesLanding, useWarehousesLandingMetrics } from '@/hooks/useWarehouses';
import { cn, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type {
  WarehousesLandingKpiCardV4,
  WarehousesLandingMetricsV4,
  WarehouseStockStatus,
} from '@/types/tenant-warehouses';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { WarehousesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Sales (high → low)' | 'Sold units (high → low)' | 'Sold SKUs (high → low)' | 'Sellable units (high → low)' | 'Name (A → Z)';
type WarehouseLandingFilters = { status: string[]; stock: string[] };

const SORT_OPTIONS: SortOption[] = [
  'Sales (high → low)',
  'Sold units (high → low)',
  'Sold SKUs (high → low)',
  'Sellable units (high → low)',
  'Name (A → Z)',
];
const SORT_TO_API: Record<SortOption, string> = {
  'Sales (high → low)': 'invoice_value_desc',
  'Sold units (high → low)': 'sold_units_desc',
  'Sold SKUs (high → low)': 'sold_sku_count_desc',
  'Sellable units (high → low)': 'sellable_units_desc',
  'Name (A → Z)': 'name_asc',
};

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

function formatCardValue(card: WarehousesLandingKpiCardV4): string {
  return formatNumberValue(card.value ?? card.entity_count ?? 0, 'COUNT');
}

function filtersFromWarehousePreset(preset: Record<string, unknown> | null | undefined): WarehouseLandingFilters {
  const filters: WarehouseLandingFilters = { status: [], stock: [] };
  if (!preset) return filters;
  if (typeof preset.sold_period === 'string') filters.status = ['active'];
  if (typeof preset.not_sold_period === 'string') filters.status = ['dormant'];
  if (preset.stock === 'out' || preset.stock_lte === 0) filters.stock = ['out_of_stock'];
  else if (preset.stock === 'low') filters.stock = ['low_stock'];
  else if (preset.stock === 'sellable' || preset.stock === 'available' || typeof preset.stock_gt === 'number') filters.stock = ['in_stock'];
  return filters;
}

export function WarehousesLandingClient({
  initialMetrics,
}: {
  initialMetrics: WarehousesLandingMetricsV4 | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/warehouses');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const period: SellerLandingPeriod = 'quarter';
  const horizonLabel = 'This quarter';
  const metricsQuery = useWarehousesLandingMetrics(initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-warehouses-landing',
    scopeKey: 'v4-this-quarter',
    pathnameOverride: '/warehouses',
    version: 4,
    initialState: {
      search: '',
      filterPreset: null as Record<string, unknown> | null,
      filters: {
        status: [] as string[],
        stock: [] as string[],
      },
      sortBy: 'Sales (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });

  const filters: WarehouseLandingFilters = routeState.filters ?? { status: [], stock: [] };
  const filterPreset = routeState.filterPreset ?? null;
  const { data, isLoading, isError, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useWarehousesLanding(
    period,
    {
      search: routeState.search,
      status: filters.status,
      stock: filters.stock,
      sort: SORT_TO_API[routeState.sortBy],
      filter_preset: filterPreset,
    },
    null,
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;

  useRouteScrollRestoration({
    storageKey: 'seller-warehouses-landing',
    scopeKey: 'v4-this-quarter',
    pathnameOverride: '/warehouses',
    ready: !isLoading,
  });

  const rows = landingData?.warehouses ?? [];
  const groups: FilterBarGroup[] = (landingData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof WarehouseLandingFilters] ?? [],
    onChange: (values) =>
      setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), [group.key]: values },
        filterPreset: null,
      })),
  }));

  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && rows.length === 0;
  const totalRows = landingData?.total ?? rows.length;
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(rows.length, SELLER_INFINITE_SCROLL_RATIO),
    [rows.length],
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

  const kpiOptions = (metricsData?.cards ?? []).map((card: WarehousesLandingKpiCardV4) => ({
    id: card.id,
    label: card.label,
    value: formatCardValue(card),
    sub: card.supporting_text ?? card.time_basis ?? '',
    filterPreset: card.filter_preset ?? null,
  }));
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? {
    id: 'warehouses',
    label: 'Warehouses',
    value: formatNumberValue(totalRows, 'COUNT'),
    sub: horizonLabel,
    filterPreset: null,
  };

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

  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading warehouses" />
    ) : (
      <WarehousesLandingSkeleton />
    );
  }

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <SplitPaneStickyHeaderSlot
          isPaneOpen={isPaneOpen}
          showRefreshingState={showRefreshingState}
          isError={isError}
        >
        <PageHeader
          eyebrow={isPaneOpen ? 'Warehouses' : 'Inventory'}
          title={isPaneOpen ? selectedOption.label : 'Warehouses'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${totalRows} warehouses · sales and stock posture for ${horizonLabel.toLowerCase()}.`}
          horizon={horizonLabel}
          primary="Add warehouse"
          onPrimaryClick={() => setSheetOpen(true)}
          compact={isPaneOpen}
        />

        {isPaneOpen ? null : (
          <InsightStrip4
            tiles={kpiOptions.map((option): InsightTile => ({
              label: option.label,
              value: option.value,
              sub: option.sub,
              onClick: () => {
                setSelectedKpiKey(option.id);
                setRouteState((current) => ({
                  ...current,
                  filterPreset: option.filterPreset,
                  filters: filtersFromWarehousePreset(option.filterPreset),
                }));
              },
              selected: option.id === selectedKpiKey,
            }))}
          />
        )}

        <FilterBar
          count={`${rows.length} of ${totalRows} warehouses${(isFetching || isFetchingNextPage) ? ' · Updating' : ''}`}
          searchPlaceholder="Search warehouse…"
          chips={[]}
          activeChip=""
          sortBy={routeState.sortBy}
          hideViewToggle
          compact={isPaneOpen}
          groups={groups}
          searchValue={routeState.search}
          onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value, filterPreset: null }))}
          sortOptions={[...SORT_OPTIONS]}
          onSortChange={(value) => setRouteState((current) => ({ ...current, sortBy: value as SortOption }))}
        />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {isError ? (
        <ErrorState
          heading="Couldn't load warehouses"
          description="There was a problem fetching your warehouses. Please try again."
          onRetry={() => refetch()}
        />
      ) : showTableSkeleton ? (
        isPaneOpen ? (
          <SplitPaneListRowsSkeleton isPaneOpen />
        ) : (
          <LandingTableRowsSkeleton columns={8} tableMinWidth={1500} />
        )
      ) : rows.length === 0 ? (
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
            { label: `Sales · ${horizonLabel}`, align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
            { label: 'Sold SKUs', align: 'right', minWidth: 110, maxWidth: 130, className: 'px-5' },
            { label: 'Sold units', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
            { label: 'Sellable units', align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
            { label: 'Stock status', minWidth: 130, maxWidth: 150, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1500}
          forceCompact={isPaneOpen}
          sentinelIndex={sentinelIndex}
          sentinelRef={sentinelRef}
          mobileRows={rows.map((row) => ({
            id: row.id,
            href: `/warehouses/${row.id}`,
            eyebrow: [row.city, row.state].filter(Boolean).join(', ') || '—',
            primary: row.name,
            supporting: `${row.sold_sku_count} sold SKUs · ${formatNumberValue(row.sellable_units, 'COUNT')} in stock`,
            trailing: formatNumberValue(row.invoice_value, 'CURRENCY_THRESHOLD'),
            selected: row.id === openId,
          }))}
        >
          {rows.map((row, index) => (
            <Fragment key={row.id}>
            {index === sentinelIndex ? (
              <tr aria-hidden="true" style={{ height: 0 }}>
                <td colSpan={8} className="p-0"><div ref={sentinelRef} /></td>
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
              <td className="px-3 py-3">
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
              <td className="px-3 py-3 text-sm text-cream-700">{row.linked_location_name ?? '—'}</td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{row.invoice_value > 0 ? formatNumberValue(row.invoice_value, 'CURRENCY_THRESHOLD') : '—'}</td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{row.sold_sku_count > 0 ? row.sold_sku_count : '—'}</td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{row.sold_units > 0 ? formatNumberValue(row.sold_units, 'COUNT') : '—'}</td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{formatNumberValue(row.sellable_units, 'COUNT')}</td>
              <td className={cn('px-3 py-3 text-sm font-medium', stockTone(row.stock_status) === 'danger' ? 'text-red-700' : stockTone(row.stock_status) === 'warning' ? 'text-amber-700' : 'text-emerald-700')}>
                {stockLabel(row.stock_status)}
              </td>
              <td className="px-3 py-3 text-right text-cream-500">
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
