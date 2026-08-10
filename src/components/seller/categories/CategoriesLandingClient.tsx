'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { ChevronRight, Tag } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StickyListHeader,
  FilterBar,
  type FilterBarGroup,
  type InsightTile,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import {
  useCategoriesLandingMetrics,
  useCategoryLanding,
  type CategoriesLandingKpiCardV4,
  type CategoriesLandingMetricsV4,
  type CategoryLandingSort,
} from '@/hooks/useCategories';
import { CategoryFormSheet } from '@/components/seller/settings/CategoryFormSheet';
import { cn, formatNumberValue } from '@/lib/utils';
import { CATEGORIES_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { useSellerPageView, useSellerCtaCapture } from '@/hooks/useSellerPageView';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Sales (high → low)' | 'Name (A → Z)' | 'OOS SKUs (high → low)' | 'Invoices (high → low)' | 'Customers (high → low)';
type CategoryLandingFilters = { status: string[]; products: string[]; stock: string[] };

const SORT_OPTIONS: SortOption[] = ['Sales (high → low)', 'Name (A → Z)', 'OOS SKUs (high → low)', 'Invoices (high → low)', 'Customers (high → low)'];
const SORT_TO_API: Record<SortOption, CategoryLandingSort> = {
  'Sales (high → low)': 'invoice_value_desc',
  'Name (A → Z)': 'name_asc',
  'OOS SKUs (high → low)': 'oos_sku_count_desc',
  'Invoices (high → low)': 'invoice_count_desc',
  'Customers (high → low)': 'invoice_buyer_count_desc',
};

function filtersFromCategoryPreset(preset: Record<string, unknown> | null | undefined): CategoryLandingFilters {
  const filters: CategoryLandingFilters = { status: [], products: [], stock: [] };
  if (!preset) return filters;
  if (typeof preset.sold_period === 'string') filters.status = ['active'];
  if (typeof preset.not_sold_period === 'string') filters.status = ['dormant'];
  if (preset.stock === 'out' || preset.stock_lte === 0) filters.stock = ['out_of_stock'];
  else if (preset.stock === 'low') filters.stock = ['low_stock'];
  else if (preset.stock === 'available' || typeof preset.stock_gt === 'number') filters.stock = ['in_stock'];
  return filters;
}

function CategoriesLandingContent({
  initialMetrics,
}: {
  initialMetrics: CategoriesLandingMetricsV4 | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/categories');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const queryClient = useQueryClient();
  useSellerPageView();
  const captureCta = useSellerCtaCapture();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const period: SellerLandingPeriod = 'quarter';
  const horizonLabel = 'This quarter';
  const metricSuffix = 'QTD';
  const metricsQuery = useCategoriesLandingMetrics(initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-categories-landing',
    scopeKey: 'fixed-quarter',
    pathnameOverride: '/categories',
    version: 5,
    initialState: {
      search: '',
      filterPreset: null as Record<string, unknown> | null,
      filters: {
        status: [] as string[],
        products: [] as string[],
        stock: [] as string[],
      },
      sortBy: 'Sales (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const { search, sortBy } = routeState;
  const filterPreset = routeState.filterPreset ?? null;
  const filters: CategoryLandingFilters = routeState.filters ?? { status: [], products: [], stock: [] };
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useCategoryLanding(
    period,
    { search, status: filters.status, products: filters.products, stock: filters.stock, sort: SORT_TO_API[sortBy], filter_preset: filterPreset },
    null,
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-categories-landing',
    scopeKey: 'fixed-quarter',
    pathnameOverride: '/categories',
    ready: !isLoading,
  });
  const groups: FilterBarGroup[] = (landingData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof typeof filters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
      filterPreset: null,
    })),
  }));
  const rows = landingData?.rows ?? [];
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && rows.length === 0;
  const visibleRows = rows;
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(visibleRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [visibleRows.length],
  );
  const hasMore = Boolean(hasNextPage);
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isFetchingNextPage,
    onLoadMore: () => {
      void fetchNextPage();
    },
  });

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load categories"
        description="There was a problem fetching category performance data. Please try again."
      />
    );
  }

  const showRefreshingState = isLoading && !data;
  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton
        ariaLabel="Loading categories"
        showLeading
        eyebrowWidth="w-20"
        titleWidth="w-44"
        subtitleWidth="w-52"
      />
    ) : (
      <CategoriesLandingSkeleton />
    );
  }

  const totalRows = landingData?.total ?? visibleRows.length;
  const kpiOptions = (metricsData?.cards ?? []).map((card: CategoriesLandingKpiCardV4) => ({
    id: card.id,
    label: kpiLabel(CATEGORIES_KPI_COPY, card),
    value: formatNumberValue(card.value ?? card.entity_count ?? 0, 'COUNT'),
    sub: kpiSupportingText(CATEGORIES_KPI_COPY, card),
    filterPreset: card.filter_preset ?? null,
  }));
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0] ?? {
    id: 'categories',
    label: 'Categories',
    value: `${totalRows}`,
    sub: horizonLabel,
    filterPreset: null,
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
          eyebrow={isPaneOpen ? 'Categories' : 'Catalog'}
          title={isPaneOpen ? selectedOption.label : 'Categories'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${totalRows} categories in ${horizonLabel.toLowerCase()}.`}
          horizon={horizonLabel}
          primary="Add category"
          onPrimaryClick={() => {
            captureCta('add_category');
            setAddSheetOpen(true);
          }}
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
                  filters: filtersFromCategoryPreset(option.filterPreset),
                }));
              },
              selected: option.id === selectedKpiKey,
            }))}
          />
        )}

        <FilterBar
          count={`${visibleRows.length} of ${totalRows} categories${(isFetching || isFetchingNextPage) ? ' · Updating' : ''}`}
          searchPlaceholder="Search category…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          compact={isPaneOpen}
          groups={groups}
          searchValue={search}
          onSearchChange={(value) => setRouteState((s) => ({ ...s, search: value, filterPreset: null }))}
          sortOptions={SORT_OPTIONS}
          onSortChange={(option) => setRouteState((s) => ({ ...s, sortBy: option as SortOption }))}
        />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {isError ? (
        <ErrorState
          heading="Couldn't load categories"
          description="There was a problem fetching category performance data."
        />
      ) : (
        <>
          {showTableSkeleton ? (
            isPaneOpen ? (
              <SplitPaneListRowsSkeleton isPaneOpen showLeading />
            ) : (
              <LandingTableRowsSkeleton columns={8} tableMinWidth={1380} />
            )
          ) : (
          <LandingTable
          columns={[
              { label: 'Category', minWidth: 280, maxWidth: 360, className: 'px-5' },
              { label: 'Brands', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
              { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
              { label: `Invoices · ${metricSuffix}`, align: 'right', minWidth: 130, maxWidth: 150, className: 'px-5' },
              { label: 'Purchasing customers', align: 'right', minWidth: 160, maxWidth: 190, className: 'px-5' },
              { label: 'Selling / Total SKUs', align: 'right', minWidth: 160, maxWidth: 190, className: 'px-5' },
              { label: 'Stock', align: 'right', minWidth: 160, maxWidth: 190, className: 'px-5' },
              { width: 40, className: 'px-4' },
            ]}
            tableMinWidth={1380}
            showEmptyState={visibleRows.length === 0 && !isLoading}
            emptyState={
              <EmptyState
                icon={<Tag size={28} strokeWidth={1.5} />}
                heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching categories' : 'No categories yet'}
                description={
                  search.trim() || groups.some((group) => group.values.length > 0)
                    ? 'Try a different search or filter.'
                    : 'Add your first category to start tracking performance.'
                }
                action={
                  <Button variant="accent" onClick={() => setAddSheetOpen(true)}>
                    Add category
                  </Button>
                }
              />
            }
            forceCompact={isPaneOpen}
            sentinelIndex={sentinelIndex}
            sentinelRef={sentinelRef}
            mobileRows={visibleRows.map((row) => ({
              id: row.id,
              href: `/categories/${row.id}`,
              leading: (
                <EntityAvatar initials={row.initials} hue={row.is_active ? 'teal' : 'cream'} imageUrl={row.image_url} size={32} />
              ),
              eyebrow: `${row.brand_count} brands`,
              primary: row.name,
              supporting: `${formatNumberValue(row.invoice_product_count ?? 0, 'COUNT')} selling of ${formatNumberValue(row.total_sku_count ?? row.active_sku_count, 'COUNT')} SKUs`,
              trailing: row.gmv_mtd > 0 ? formatNumberValue(row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—',
              selected: row.id === openId,
            }))}
          >
            {visibleRows.map((row, index) => (
              <Fragment key={row.id}>
              {index === sentinelIndex ? (
                <tr aria-hidden="true" style={{ height: 0 }}>
                  <td colSpan={8} className="p-0"><div ref={sentinelRef} /></td>
                </tr>
              ) : null}
              <tr
                className={cn(
                  'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
                  row.id === openId ? 'bg-ember-50' : 'bg-white',
                )}
                onClick={() => router.push(`/categories/${row.id}`)}
                onPointerDown={() => triggerHaptic()}
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <EntityAvatar initials={row.initials} hue={row.is_active ? 'teal' : 'cream'} imageUrl={row.image_url} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-cream-900">{row.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                  {row.brand_count}
                </td>
                <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                  {(row.invoice_value ?? row.gmv_mtd) > 0 ? formatNumberValue(row.invoice_value ?? row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                  {formatNumberValue(row.invoice_count ?? 0, 'COUNT')}
                </td>
                <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                  {formatNumberValue(row.invoice_buyer_count ?? row.buyers_count ?? 0, 'COUNT')}
                </td>
                <td className="px-3 py-3 text-right text-medium text-cream-700">
                  {formatNumberValue(row.invoice_product_count ?? 0, 'COUNT')} / {formatNumberValue(row.total_sku_count ?? row.active_sku_count, 'COUNT')}
                </td>
                <td className="px-3 py-3 text-right text-medium text-cream-700">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-base tabular-nums text-cream-900">{formatNumberValue(row.stock_on_hand ?? 0, 'COUNT')}</span>
                    <span className="text-xs text-cream-600">
                      {formatNumberValue(row.low_stock_sku_count, 'COUNT')} low · {formatNumberValue(row.oos_sku_count, 'COUNT')} OOS
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-cream-400">
                  <ChevronRight size={16} />
                </td>
              </tr>
              </Fragment>
            ))}
          </LandingTable>
          )}
        </>
      )}

      <CategoryFormSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        editingCategory={null}
        onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['categories-landing'] })}
      />
      </div>
    </PageWrap>
  );
}

export function CategoriesLandingClient({
  initialMetrics,
}: {
  initialMetrics: CategoriesLandingMetricsV4 | null;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <CategoriesLandingContent initialMetrics={initialMetrics} />
    </FeatureGate>
  );
}
