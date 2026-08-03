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
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useCategoryLanding, type CategoryTableRow, type CategoriesLandingResponse } from '@/hooks/useCategories';
import { CategoryFormSheet } from '@/components/seller/settings/CategoryFormSheet';
import { cn, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { SellerMobileListSkeleton } from '@/components/seller/mobile';

type SortOption = 'GMV (high → low)' | 'Name (A → Z)' | 'OOS SKUs (high → low)';

const STATUS_OPTIONS = ['Active', 'Inactive'] as const;
const PRODUCT_OPTIONS = ['Has Products', 'Empty'] as const;
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'Name (A → Z)', 'OOS SKUs (high → low)'];

function CategoriesDataSkeleton({ isPaneOpen }: { isPaneOpen?: boolean }) {
  if (isPaneOpen) {
    return <SellerMobileListSkeleton count={6} forceVisible />;
  }
  return (
    <>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-2 h-[320px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </>
  );
}

function CategoriesLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: CategoriesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = openId != null;
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const queryClient = useQueryClient();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('invoiced-sales');
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-categories-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/categories',
    version: 4,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
        products: [] as string[],
      },
      sortBy: 'GMV (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const { search, sortBy } = routeState;
  const filters = routeState.filters ?? { status: [], products: [] };
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useCategoryLanding(period, { search, status: filters.status, products: filters.products }, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-categories-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/categories',
    ready: !isLoading,
  });
  const groups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.status ?? [],
      onChange: (values) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), status: values },
      })),
    },
    {
      key: 'products',
      label: 'Products',
      options: PRODUCT_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.products ?? [],
      onChange: (values) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), products: values },
      })),
    },
  ];
  const rows = landingData?.rows ?? [];

  const filtered = useMemo<CategoryTableRow[]>(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const statusFilter = filters.status ?? [];
        const productFilter = filters.products ?? [];
        const statusOk =
          statusFilter.length === 0 ||
          statusFilter.includes('All') ||
          (statusFilter.includes('Active') ? r.is_active : !r.is_active);
        const productOk =
          productFilter.length === 0 ||
          productFilter.includes('All') ||
          (productFilter.includes('Has Products') ? r.active_sku_count > 0 : r.active_sku_count === 0);
        return statusOk && productOk;
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'Name (A → Z)') return a.name.localeCompare(b.name);
        if (sortBy === 'OOS SKUs (high → low)') return b.oos_sku_count - a.oos_sku_count;
        return b.gmv_mtd - a.gmv_mtd;
      });
  }, [filters.products, filters.status, rows, search, sortBy]);
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filtered.length === 0;
  const visibleRows = filtered;
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
  const kpis = landingData?.kpis;
  const safeKpis = kpis ?? {
    active_count: 0,
    uncategorized_count: 0,
    uncategorised_active_product_count: 0,
    categorised_active_product_count: 0,
  };

  const kpiOptions = [
    {
      id: 'invoiced-sales',
      // rows.reduce sums only the currently-loaded page(s) of categories, not
      // the tenant total — get_seller_category_landing_summary_v2 computes a
      // true total_gmv internally but does not return it in its kpis object.
      // This is an approximation until that field is exposed.
      label: `Invoiced sales · ${metricSuffix}`,
      value: formatNumberValue(rows.reduce((s, r) => s + r.gmv_mtd, 0), 'CURRENCY_THRESHOLD'),
      sub: `${Math.max(0, safeKpis.active_count - safeKpis.uncategorized_count)} categories`,
    },
    {
      id: 'categories-with-sales',
      label: 'Categories with invoiced sales',
      value: `${Math.max(0, safeKpis.active_count - safeKpis.uncategorized_count)}`,
      sub: `of ${safeKpis.active_count} active categories`,
    },
    {
      id: 'categories-no-sale',
      label: 'Categories with no sale in 90D',
      value: `${safeKpis.uncategorized_count}`,
      sub: `${safeKpis.uncategorized_count > 1 ? `${safeKpis.uncategorized_count} categories` : 'category'}`,
    },
    {
      id: 'uncategorised-products',
      label: 'Uncategorised active products',
      value: `${safeKpis.uncategorised_active_product_count}`,
      sub: 'products don\'t have a category',
    },
  ];
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <PageHeader
          eyebrow={isPaneOpen ? 'Categories' : 'Catalog'}
          title={isPaneOpen ? selectedOption.label : 'Categories'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${safeKpis.active_count} categories · ${safeKpis.categorised_active_product_count} categorised products · ${safeKpis.uncategorised_active_product_count} need setup.`}
          horizon={horizonLabel}
          primary="Add category"
          onPrimaryClick={() => setAddSheetOpen(true)}
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
              count={`${filtered.length} categories`}
              searchPlaceholder="Search category…"
              chips={[]}
              activeChip=""
              sortBy={sortBy}
              hideViewToggle
              compact={isPaneOpen}
              groups={groups}
              searchValue={search}
              onSearchChange={(value) => setRouteState((s) => ({ ...s, search: value }))}
              sortOptions={SORT_OPTIONS}
              onSortChange={(option) => setRouteState((s) => ({ ...s, sortBy: option as SortOption }))}
            />
          </>
        )}
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {showRefreshingState ? (
        <CategoriesDataSkeleton isPaneOpen={isPaneOpen} />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load categories"
          description="There was a problem fetching category performance data."
        />
      ) : (
        <>
          {showTableSkeleton ? (
            <LandingTableRowsSkeleton columns={6} tableMinWidth={1220} forceCompact={isPaneOpen} />
          ) : (
          <LandingTable
          columns={[
              { label: 'Category', minWidth: 280, maxWidth: 360, className: 'px-5' },
              { label: 'Brands', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
              { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
              { label: 'Products', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
              { label: 'Out of stock SKUs', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
              { width: 40, className: 'px-4' },
            ]}
            tableMinWidth={1080}
            showEmptyState={filtered.length === 0 && !isLoading}
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
              primary: row.name,
              supporting: `${row.brand_count} brands`,
              meta: `${formatNumberValue(row.active_sku_count, 'COUNT')} products`,
              trailing: row.gmv_mtd > 0 ? formatNumberValue(row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—',
              selected: row.id === openId,
            }))}
          >
            {visibleRows.map((row, index) => (
              <Fragment key={row.id}>
              {index === sentinelIndex ? (
                <tr aria-hidden="true" style={{ height: 0 }}>
                  <td colSpan={6} className="p-0"><div ref={sentinelRef} /></td>
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
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <EntityAvatar initials={row.initials} hue={row.is_active ? 'teal' : 'cream'} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-cream-900">{row.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">
                  {row.brand_count}
                </td>
                <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">
                  {row.gmv_mtd > 0 ? formatNumberValue(row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—'}
                </td>
                <td className="px-3 py-2 text-right text-medium text-cream-700">
                  {formatNumberValue(row.active_sku_count, 'COUNT')}
                </td>
                <td className="px-3 py-2 text-right text-medium text-cream-700">
                  {row.oos_sku_count > 0 ? formatNumberValue(row.oos_sku_count, 'COUNT') : '—'}
                </td>
                <td className="px-3 py-2 text-right text-cream-400">
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
  initialData,
  initialPeriod,
}: {
  initialData: CategoriesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <CategoriesLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
