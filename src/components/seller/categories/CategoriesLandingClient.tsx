'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ChevronRight, Tag } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  V3CalloutPanel,
  FilterBar,
  GrowthPill,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useCategoryLanding, type CategoryTableRow, type CategoriesLandingResponse } from '@/hooks/useCategories';
import { CategoryFormSheet } from '@/components/seller/settings/CategoryFormSheet';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type FilterChip = 'All' | 'Active' | 'Empty';
type SortOption = 'GMV (high → low)' | 'Name (A → Z)' | 'OOS SKUs (high → low)';

const FILTER_CHIPS: FilterChip[] = ['All', 'Active', 'Empty'];
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'Name (A → Z)', 'OOS SKUs (high → low)'];

function DaysCoverBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-cream-400">—</span>;
  const cls =
    value < 7
      ? 'text-danger-600 font-semibold'
      : value < 14
        ? 'text-amber-600 font-medium'
        : 'text-cream-700';
  return <span className={cls}>{value}d</span>;
}

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
}: {
  initialData: CategoriesLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const { period, setPeriod, horizonLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useCategoryLanding(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;

  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-categories-landing',
    scopeKey: period,
    initialState: {
      search: '',
      activeChip: 'All' as FilterChip,
      sortBy: 'GMV (high → low)' as SortOption,
    },
  });
  useRouteScrollRestoration({
    storageKey: 'seller-categories-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  const { search, activeChip, sortBy } = routeState;
  const rows = landingData?.rows ?? [];

  const filtered = useMemo<CategoryTableRow[]>(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (activeChip === 'Active') return r.is_active && r.active_sku_count > 0;
        if (activeChip === 'Empty') return r.active_sku_count === 0;
        return true;
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === 'Name (A → Z)') return a.name.localeCompare(b.name);
        if (sortBy === 'OOS SKUs (high → low)') return b.oos_sku_count - a.oos_sku_count;
        return b.gmv_mtd - a.gmv_mtd;
      });
  }, [rows, search, activeChip, sortBy]);

  if (isLoading && !landingData) return <CategoriesLoadingSkeleton />;
  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load categories"
        description="There was a problem fetching category performance data. Please try again."
      />
    );
  }
  if (!landingData) return <CategoriesLoadingSkeleton />;

  const showRefreshingState = isLoading && !data;
  const kpis = landingData.kpis;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        subtitle="Track performance, stock health, and revenue by product category."
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
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
                label: 'Active categories',
                value: `${kpis.active_count}`,
                sub: `${kpis.low_stock_count} with low-stock products`,
              },
              {
                label: `GMV · ${metricSuffix}`,
                value: formatCompactInr(rows.reduce((s, r) => s + r.gmv_mtd, 0)),
                sub: 'across all categories',
                tone: 'accent',
              },
              {
                label: 'Top category share',
                value: kpis.top_category_name ? `${kpis.top_category_share_pct}%` : '—',
                sub: kpis.top_category_name ?? 'No sales yet',
              },
              {
                label: 'Uncategorised SKUs',
                value: `${kpis.uncategorized_count}`,
                sub: 'products with no category',
              },
            ]}
          />

          <V3CalloutPanel
            items={[
              {
                kind: 'risk',
                eyebrow: 'Stockout risk',
                hint: `${landingData.callouts.stockout_risk.length}`,
                rows: landingData.callouts.stockout_risk.map((c) => ({
                  initials: c.initials,
                  hue: 'teal' as const,
                  name: c.name,
                  reason: `${c.oos_sku_count ?? 0} OOS · ${c.low_stock_sku_count ?? 0} low-stock`,
                  trailing: null,
                })),
              },
              {
                kind: 'info',
                eyebrow: 'Top performers',
                hint: 'by GMV',
                rows: landingData.callouts.top_performers.map((c) => ({
                  initials: c.initials,
                  hue: 'teal' as const,
                  name: c.name,
                  reason: `${c.buyers_count ?? 0} buyers`,
                  trailing: formatCompactInr(c.gmv_mtd ?? 0),
                })),
              },
              {
                kind: 'opportunity',
                eyebrow: 'Fast movers',
                hint: 'by units sold',
                rows: landingData.callouts.fast_movers.map((c) => ({
                  initials: c.initials,
                  hue: 'teal' as const,
                  name: c.name,
                  reason: `${c.units_mtd ?? 0} units sold`,
                  trailing: <GrowthPill value={c.growth_pct ?? 0} />,
                })),
              },
            ]}
          />

          <FilterBar
            count={`${filtered.length} categories`}
            searchPlaceholder="Search category…"
            chips={FILTER_CHIPS}
            activeChip={activeChip}
            sortBy={sortBy}
            hideViewToggle
            searchValue={search}
            onSearchChange={(value) => setRouteState((s) => ({ ...s, search: value }))}
            onChipChange={(chip) => setRouteState((s) => ({ ...s, activeChip: chip as FilterChip }))}
            sortOptions={SORT_OPTIONS}
            onSortChange={(option) => setRouteState((s) => ({ ...s, sortBy: option as SortOption }))}
          />

          <LandingTable
            columns={[
              { label: 'Category', width: '30%' },
              { label: `GMV · ${metricSuffix}`, align: 'right' },
              { label: 'Growth', align: 'right' },
              { label: 'SKUs', align: 'right' },
              { label: 'Avg days cover', align: 'right' },
              { label: '', width: 40 },
            ]}
            showEmptyState={filtered.length === 0}
            emptyState={
              <EmptyState
                icon={<Tag size={28} strokeWidth={1.5} />}
                heading={search.trim() || activeChip !== 'All' ? 'No matching categories' : 'No categories yet'}
                description={
                  search.trim() || activeChip !== 'All'
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
                className="cursor-pointer border-b border-cream-200 transition-colors last:border-0 hover:bg-cream-50"
                onClick={() => router.push(`/categories/${row.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-teal-100 text-xs font-semibold text-teal-700">
                      {row.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-cream-900">{row.name}</p>
                      <p className="text-xs text-cream-500">
                        {row.brand_count} brand{row.brand_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-cream-900">
                  {row.gmv_mtd > 0 ? formatCompactInr(row.gmv_mtd) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <GrowthPill value={row.growth_pct} />
                </td>
                <td className="px-4 py-3 text-right text-sm text-cream-700">
                  <span className="font-medium text-cream-900">{row.active_sku_count}</span>
                  {row.oos_sku_count > 0 && (
                    <span className="ml-1 text-xs text-danger-600">({row.oos_sku_count} OOS)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  <DaysCoverBadge value={row.avg_days_cover} />
                </td>
                <td className="px-4 py-3 text-right text-cream-400">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </LandingTable>
        </>
      )}

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
