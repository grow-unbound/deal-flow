'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ChevronRight, Tag } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  V3CalloutPanel,
  FilterBar,
  type FilterBarGroup,
  GrowthPill,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useCategoryLanding, type CategoryTableRow, type CategoriesLandingResponse } from '@/hooks/useCategories';
import { CategoryFormSheet } from '@/components/seller/settings/CategoryFormSheet';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { CategoriesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingPageLoadMore } from '@/components/seller/layout/LandingPageLoadMore';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';

type SortOption = 'GMV (high → low)' | 'Name (A → Z)' | 'OOS SKUs (high → low)';

const STATUS_OPTIONS = ['Active', 'Inactive'] as const;
const PRODUCT_OPTIONS = ['Has Products', 'Empty'] as const;
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'Name (A → Z)', 'OOS SKUs (high → low)'];

function CategoriesLoadingSkeleton() {
  return (
    <PageWrap>
      <div className="h-24 animate-pulse rounded-[12px] bg-cream-100" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-2 h-[320px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </PageWrap>
  );
}

function CategoriesDataSkeleton() {
  return (
    <>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
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
  initialSearch,
}: {
  initialData: CategoriesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-categories-landing',
    scopeKey: 'fixed-90d',
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

  // Doc-starred Action "Categories with no sale in 90 days" — derived client-side from
  // the already-fetched category rows (no backend list for this exists yet).
  const noSaleCategories = useMemo(
    () => rows.filter((r) => r.gmv_mtd === 0 && r.active_sku_count > 0).sort((a, b) => b.active_sku_count - a.active_sku_count).slice(0, 10),
    [rows],
  );

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

  if (isLoading && !landingData) return <CategoriesLandingSkeleton />;
  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load categories"
        description="There was a problem fetching category performance data. Please try again."
      />
    );
  }
  if (!landingData) return <CategoriesLandingSkeleton />;

  const showRefreshingState = isLoading && !data;
  const kpis = landingData.kpis;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        subtitle={`${kpis.active_count} categories · ${kpis.categorised_active_product_count} categorised products · ${kpis.uncategorised_active_product_count} need setup.`}
        horizon={horizonLabel}
        primary="Add category"
        onPrimaryClick={() => setAddSheetOpen(true)}
      />

      {showRefreshingState ? (
        <CategoriesDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load categories"
          description="There was a problem fetching category performance data."
        />
      ) : (
        <>
          <InsightStrip4
            tiles={[
              {
                // rows.reduce sums only the currently-loaded page(s) of categories, not
                // the tenant total — get_seller_category_landing_summary_v2 computes a
                // true total_gmv internally but does not return it in its kpis object.
                // This is an approximation until that field is exposed.
                label: `Invoiced sales · ${metricSuffix}`,
                value: formatCompactInr(rows.reduce((s, r) => s + r.gmv_mtd, 0)),
                sub: `${Math.max(0, kpis.active_count - kpis.uncategorized_count)} categories with sales`,
                tone: 'accent',
              },
              {
                label: 'Categories with invoiced sales',
                value: `${Math.max(0, kpis.active_count - kpis.uncategorized_count)}`,
                sub: `of ${kpis.active_count} active categories`,
              },
              {
                label: 'Categories with no sale in 90D',
                value: `${kpis.uncategorized_count}`,
                sub: `${kpis.low_stock_count} categories have stock risk`,
                tone: 'warn',
              },
              {
                label: 'Uncategorised active products',
                value: `${kpis.uncategorised_active_product_count}`,
                sub: 'products need a category assigned',
              },
            ]}
          />

          <V3CalloutPanel
            items={[
              {
                id: 'stockout_risk',
                kind: 'risk',
                eyebrow: 'Categories with recent sellers out of stock',
                hint: `${landingData.callouts.stockout_risk.length}`,
                getHref: (row) => `/categories/${row.id}`,
                rows: landingData.callouts.stockout_risk.map((c) => ({
                  id: c.id,
                  initials: c.initials,
                  hue: 'teal' as const,
                  name: c.name,
                  reason: `${c.oos_sku_count ?? 0} OOS · ${c.low_stock_sku_count ?? 0} low-stock`,
                  trailing: null,
                })),
              },
              {
                id: 'no_sale_90d',
                kind: 'info',
                eyebrow: 'Categories with no sale in 90 days',
                // Derived from already-fetched category rows, not a tenant-wide backend
                // aggregate — honest about undercounting until every page is loaded.
                hint: hasNextPage ? `${noSaleCategories.length}+ categories` : `${noSaleCategories.length} categories`,
                getHref: (row) => `/categories/${row.id}`,
                rows: noSaleCategories.map((c) => ({
                  id: c.id,
                  initials: c.initials,
                  hue: 'teal' as const,
                  name: c.name,
                  reason: `${c.active_sku_count} active SKUs`,
                  trailing: null,
                })),
              },
              {
                id: 'fast_movers',
                kind: 'opportunity',
                eyebrow: 'Categories gaining demand',
                hint: 'by units sold',
                getHref: (row) => `/categories/${row.id}`,
                rows: landingData.callouts.fast_movers.map((c) => ({
                  id: c.id,
                  initials: c.initials,
                  hue: 'teal' as const,
                  name: c.name,
                  // fast_movers rows don't carry growth_pct — get_seller_category_landing_summary_v2
                  // never returns it for this list, so the previous `c.growth_pct ?? 0` fallback
                  // silently rendered a permanent "flat" badge. Show the real GMV instead.
                  reason: `${c.units_mtd ?? 0} units sold`,
                  trailing: formatCompactInr(c.gmv_mtd ?? 0),
                })),
              },
            ]}
          />

          <FilterBar
            count={`${filtered.length} categories`}
            searchPlaceholder="Search category…"
            chips={[]}
            activeChip=""
            sortBy={sortBy}
            hideViewToggle
            groups={groups}
            searchValue={search}
            onSearchChange={(value) => setRouteState((s) => ({ ...s, search: value }))}
            sortOptions={SORT_OPTIONS}
            onSortChange={(option) => setRouteState((s) => ({ ...s, sortBy: option as SortOption }))}
          />

          {showTableSkeleton ? (
            <LandingTableRowsSkeleton columns={7} tableMinWidth={1220} />
          ) : (
          <LandingTable
          columns={[
              { label: 'Category', minWidth: 280, maxWidth: 360, className: 'px-5' },
              { label: 'Brands', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
              { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
              { label: 'Trend', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
              { label: 'Products', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
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
          >
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                onClick={() => router.push(`/categories/${row.id}`)}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <EntityAvatar initials={row.initials} hue={row.is_active ? 'teal' : 'cream'} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-cream-900">{row.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                  {row.brand_count}
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                  {row.gmv_mtd > 0 ? formatCompactInr(row.gmv_mtd) : '—'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <GrowthPill value={row.growth_pct} />
                </td>
                <td className="px-5 py-3.5 text-right text-sm text-cream-700">
                  <span className="font-medium text-cream-900">{row.active_sku_count}</span>
                  {row.oos_sku_count > 0 && (
                    <span className="ml-1 text-xs text-danger-600">({row.oos_sku_count} OOS)</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right text-cream-400">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </LandingTable>
          )}
        </>
      )}

      <LandingPageLoadMore hasMore={Boolean(hasNextPage)} loading={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

      <CategoryFormSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        editingCategory={null}
        onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['categories-landing'] })}
      />
    </PageWrap>
  );
}

export function CategoriesLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: CategoriesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <CategoriesLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
