'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';

import { FeatureGate } from '@/components/FeatureGate';
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
import { SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import {
  useLocationsLanding,
  useLocationsLandingMetrics,
  type LocationsLandingMetricsV4,
  type LocationsLandingRow,
  type LocationsLandingKpiCardV4,
  type LocationsLandingSort,
} from '@/hooks/useLocations';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { cn, formatNumberValue } from '@/lib/utils';
import { joinSplitListMeta } from '@/lib/seller-split-list-ui';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LocationFormSheet } from '@/components/seller/settings/LocationFormSheet';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { LocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Sales (high → low)' | 'Open demand (high → low)' | 'Overdue (high → low)';
type LocationLandingFilters = { status: string[]; attention: string[] };
const SORT_OPTIONS: SortOption[] = ['Sales (high → low)', 'Open demand (high → low)', 'Overdue (high → low)'];

function sortKeyFromOption(option: SortOption): LocationsLandingSort {
  if (option === 'Open demand (high → low)') return 'open_demand_value';
  if (option === 'Overdue (high → low)') return 'overdue_amount';
  return 'invoice_value';
}

function formatCardValue(card: LocationsLandingKpiCardV4): string {
  if (card.id.includes('sales') || card.id.includes('demand') || card.id.includes('overdue')) {
    return formatNumberValue(card.value, 'CURRENCY_THRESHOLD');
  }
  return formatNumberValue(card.value, 'COUNT');
}

function filtersFromLocationPreset(preset: Record<string, unknown> | null | undefined): LocationLandingFilters {
  const filters: LocationLandingFilters = { status: [], attention: [] };
  if (!preset) return filters;
  if (typeof preset.sold_period === 'string') filters.status = ['active'];
  if (typeof preset.not_sold_period === 'string') filters.status = ['dormant'];
  if (preset.sold_previous_period === true && preset.sold_current_period === false) filters.status = ['dormant'];
  if (preset.overdue === true) filters.attention = ['overdue'];
  if (preset.open_demand === true) filters.attention = ['open_demand'];
  if (preset.cutoff === 'top80') filters.attention = ['top80'];
  return filters;
}

function LocationsLandingContent({
  initialMetrics,
}: {
  initialMetrics: LocationsLandingMetricsV4 | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/locations');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const period: SellerLandingPeriod = 'month';
  const horizonLabel = 'This Month';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-locations-landing',
    scopeKey: 'v4-this-month',
    pathnameOverride: '/locations',
    version: 5,
    initialState: {
      search: '',
      filter_preset: null as Record<string, unknown> | null,
      filters: { status: [] as string[], attention: [] as string[] },
      sortBy: 'Sales (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filterPreset = routeState.filter_preset ?? null;
  const filters = routeState.filters ?? { status: [], attention: [] };
  const { data: metricsData } = useLocationsLandingMetrics(initialMetrics);
  const { data, isLoading, isError, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useLocationsLanding(
    period,
    { search, status: filters.status, attention: filters.attention, sort: sortKeyFromOption(sortBy), filter_preset: filterPreset },
    null,
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-locations-landing',
    scopeKey: 'v4-this-month',
    pathnameOverride: '/locations',
    ready: !isLoading,
  });
  const rows = landingData?.locations ?? [];
  const kpiCards = metricsData?.cards ?? [];
  const selectedCard = kpiCards.find((card) => card.id === selectedKpiKey) ?? kpiCards[0] ?? null;
  const groups: FilterBarGroup[] = (landingData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof LocationLandingFilters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
      filter_preset: null,
    })),
  }));
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(rows.length, SELLER_INFINITE_SCROLL_RATIO),
    [rows.length],
  );
  const hasMore = Boolean(hasNextPage);
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isFetchingNextPage,
    onLoadMore: () => {
      if (hasNextPage) void fetchNextPage();
    },
  });

  if (isError && !landingData) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load locations"
          description="There was a problem fetching your locations. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  const showRefreshingState = isLoading && !data;
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && rows.length === 0;

  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton
        ariaLabel="Loading locations"
        eyebrowWidth="w-20"
        titleWidth="w-44"
        subtitleWidth="w-52"
      />
    ) : (
      <LocationsLandingSkeleton />
    );
  }

  const totalLocations = landingData?.total ?? rows.length;
  const selectedOption = selectedCard
    ? {
        label: selectedCard.label,
        value: formatCardValue(selectedCard),
        sub: selectedCard.supporting_text ?? selectedCard.time_basis ?? '',
      }
    : {
        label: 'Locations',
        value: formatNumberValue(totalLocations, 'COUNT'),
        sub: horizonLabel,
      };

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <SplitPaneStickyHeaderSlot
          isPaneOpen={isPaneOpen}
          showRefreshingState={showRefreshingState}
          isError={isError}
        >
        <PageHeader
          eyebrow={isPaneOpen ? 'Locations' : 'Operations'}
          title={isPaneOpen ? selectedOption.label : 'Locations'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${totalLocations} location${totalLocations === 1 ? '' : 's'} · This month activity.`}
          horizon={horizonLabel}
          primary="Add location"
          onPrimaryClick={() => setSheetOpen(true)}
          compact={isPaneOpen}
        />

        {isPaneOpen ? null : (
          <InsightStrip4
            tiles={kpiCards.map((card): InsightTile => ({
              label: card.label,
              value: formatCardValue(card),
              sub: card.supporting_text ?? card.time_basis ?? '',
              onClick: () => {
                setSelectedKpiKey(card.id);
                setRouteState((current) => ({
                  ...current,
                  filter_preset: card.filter_preset ?? null,
                  filters: filtersFromLocationPreset(card.filter_preset),
                }));
              },
              selected: card.id === selectedKpiKey,
            }))}
          />
        )}

        <FilterBar
          count={`${rows.length} locations`}
          searchPlaceholder="Search location…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          compact={isPaneOpen}
          groups={groups}
          searchValue={search}
          onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value, filter_preset: null }))}
          sortOptions={[...SORT_OPTIONS]}
          onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
        />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {isError ? (
        <ErrorState
          heading="Couldn't load locations"
          description="There was a problem fetching your locations. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {showTableSkeleton ? (
            isPaneOpen ? (
              <SplitPaneListRowsSkeleton isPaneOpen />
            ) : (
              <LandingTableRowsSkeleton columns={12} tableMinWidth={1700} />
            )
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<MapPin size={28} strokeWidth={1.5} />}
              heading={search.trim() || filterPreset ? 'No matching locations' : 'No locations yet'}
              description={
                search.trim() || filterPreset
                  ? 'Try a different search or filter.'
                  : 'Add your branches and godowns to track stock and dues per location.'
              }
            />
          ) : (
          <LandingTable
            columns={[
                { label: 'Location', width: 220, minWidth: 200, maxWidth: 360, className: 'px-5' },
                { label: 'Active customers', align: 'right', minWidth: 100, maxWidth: 150, className: 'px-5' },
                { label: 'Overdue amount', align: 'right', minWidth: 100, maxWidth: 150, className: 'px-5' },
                { label: 'Sales · month', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
                { label: 'Invoices · month', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
                { label: 'Demand value · month', align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
                { label: 'Demand docs · month', align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
                { label: 'Conversion · month', align: 'right', minWidth: 130, maxWidth: 150, className: 'px-5' },
                { width: 40, className: 'px-4' },
              ]}
              tableMinWidth={1700}
              forceCompact={isPaneOpen}
              sentinelIndex={sentinelIndex}
              sentinelRef={sentinelRef}
              mobileRows={rows.map((row) => ({
                id: row.id,
                href: `/locations/${row.id}`,
                eyebrow: row.city || row.address_text || '—',
                primary: row.name,
                supporting: joinSplitListMeta(
                  row.address_text || row.city,
                  `${row.active_buyers} active customers`,
                ),
                trailing: row.gmv_mtd > 0 ? formatNumberValue(row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—',
                selected: row.id === openId,
              }))}
            >
              {rows.map((row, index) => {
                const demandCount = row.primary_demand_count;
                const demandValue = row.primary_demand_value;
                return (
                <Fragment key={row.id}>
                {index === sentinelIndex ? (
                  <tr aria-hidden="true" style={{ height: 0 }}>
                    <td colSpan={9} className="p-0"><div ref={sentinelRef} /></td>
                  </tr>
                ) : null}
                <tr
                  onClick={() => router.push(`/locations/${row.id}`)}
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
                        <p className="truncate text-base font-medium text-cream-900">{row.name}</p>
                        <p className="mt-0.5 truncate text-xs text-cream-600">{row.address_text || row.city || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.active_buyers}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.overdue_amount > 0 ? formatNumberValue(row.overdue_amount, 'CURRENCY_THRESHOLD') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.gmv_mtd > 0 ? formatNumberValue(row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.invoice_count_90d > 0 ? row.invoice_count_90d : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.primary_demand_kind === 'none' ? '—' : demandValue > 0 ? formatNumberValue(demandValue, 'CURRENCY_THRESHOLD') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.primary_demand_kind === 'none' ? '—' : demandCount > 0 ? demandCount : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.primary_demand_kind === 'none' ? '—' : row.conversion_90d > 0 ? `${row.conversion_90d}%` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-cream-500">
                    <ChevronRight size={14} className="text-cream-400" />
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </LandingTable>
          )}
        </>
      )}

      <LocationFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingLocation={null} />
      </div>
    </PageWrap>
  );
}

export function LocationsLandingClient({
  initialMetrics,
}: {
  initialMetrics: LocationsLandingMetricsV4 | null;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <LocationsLandingContent initialMetrics={initialMetrics} />
    </FeatureGate>
  );
}
