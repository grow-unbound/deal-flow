'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Upload, Plus, Package } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  type FilterBarGroup,
  GrowthPill,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useTenantProducts, useTenantProductsInfinite, type TenantProduct, type TenantProductsResponse } from '@/hooks/useProducts';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

const AddProductSheet = dynamic(
  () => import('@/components/seller/products/AddProductSheet').then((m) => m.AddProductSheet),
  { ssr: false },
);

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'On hand (low → high)';

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'On hand (low → high)'];

function getBrandHue(index: number): 'teal' | 'ember' | 'cream' {
  return (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((segment) => segment[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toLabelCase(input: string): string {
  return input
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function ProductLandingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-[36rem]" />
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
        <Skeleton className="h-[28rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function ProductLandingDataSkeleton() {
  return (
    <div className="space-y-5">
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
      <Skeleton className="h-[28rem] rounded-[14px]" />
    </div>
  );
}

function ProductsLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: TenantProductsResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { isSellerAssistant } = useRole();
  const { period, setPeriod, horizonLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const summaryQuery = useTenantProducts(period, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-products-landing',
    scopeKey: period,
    initialState: {
      search: '',
      sortBy: 'GMV (high → low)' as SortOption,
      filters: {
        brand: [] as string[],
        category: [] as string[],
        status: [] as string[],
        stock: [] as string[],
      },
    },
  });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { brand: [], category: [], status: [], stock: [] };
  const [addProductOpen, setAddProductOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantProductsInfinite(
    period,
    { search: debouncedSearch, ...filters },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px', // proactively fetch before user reaches end
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-products-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  // Flatten all pages into a single products list
  const allProducts = useMemo(() => data?.pages?.flatMap((p) => p.products) ?? [], [data?.pages]);
  // Total count from snapshot (O(1)); falls back to loaded count
  const firstPage = data?.pages?.[0];
  const filteredTotal = (firstPage as { total?: number | null } | undefined)?.total ?? firstPage?.kpis?.total_skus ?? allProducts.length;
  const summaryProducts = summaryData?.products ?? [];
  const summaryTotal = summaryData?.kpis?.total_skus ?? summaryProducts.length;
  const summaryBrands = summaryData?.brands?.length ?? 0;

  const filtered = useMemo(() => {
    return [...allProducts].sort((a, b) => {
        if (!isSellerAssistant && sortBy === 'GMV (high → low)') return Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0);
        if (!isSellerAssistant && sortBy === 'GMV (low → high)') return Number(a.gmv_mtd ?? 0) - Number(b.gmv_mtd ?? 0);
        if (!isSellerAssistant && sortBy === 'Growth (high → low)') return Number(b.growth_pct ?? 0) - Number(a.growth_pct ?? 0);
        return Number(a.on_hand ?? 0) - Number(b.on_hand ?? 0);
      });
  }, [isSellerAssistant, allProducts, sortBy]);

  const retainedFiltered = useRetainedValue(filtered.length > 0 ? filtered : null);
  const displayRows = filtered.length > 0 ? filtered : (retainedFiltered ?? []);

  if (isLoading && !data) return <ProductLandingSkeleton />;

  if (isError && !data) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load products"
          description="There was a problem fetching your products. Please try again."
        />
      </PageWrap>
    );
  }
  if (!data) return <ProductLandingSkeleton />;
  const showRefreshingState = isLoading && !data;

  const kpis = summaryData?.kpis;
  const outOfStock = kpis?.out_of_stock ?? summaryProducts.filter((p) => Number(p.on_hand ?? 0) === 0).length;
  const lowStock = kpis?.low_stock ?? summaryProducts.filter((p) => Number(p.on_hand ?? 0) > 0 && Number(p.days_cover ?? 0) < 14).length;
  const growth = kpis?.revenue_growth_pct ?? 0;
  const groups: FilterBarGroup[] = (summaryData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof typeof filters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
    })),
  }));

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        subtitle={`${summaryTotal} SKUs across ${summaryBrands} brands. ${outOfStock} out of stock, ${lowStock} running low — those are the ones to chase this week.`}
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        secondary={{
          label: 'Bulk import',
          icon: <Upload size={13} />,
          onClick: () => router.push('/products/import'),
        }}
        {...(isSellerAssistant ? {} : {
          primary: 'Add a product',
          onPrimaryClick: () => setAddProductOpen(true),
        })}
      />

      {showRefreshingState ? (
        <ProductLandingDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load products"
          description="There was a problem fetching your products. Please try again."
        />
      ) : (
        <>
      <InsightStrip4
        tiles={[
          {
            label: 'Active SKUs',
            value: `${kpis?.active_skus ?? allProducts.length}`,
            sub: `${kpis?.total_skus ?? allProducts.length} total · ${kpis?.archived_skus ?? 0} archived`,
          },
          {
            label: 'Out of stock',
            value: `${outOfStock}`,
            sub: 'replenish urgently',
            tone: 'warn',
          },
          {
            label: 'Low stock',
            value: `${lowStock}`,
            sub: '< 14 days of cover',
          },
          ...(isSellerAssistant
            ? [{
                label: `Units moved · ${metricSuffix}`,
                value: `${allProducts.reduce((sum: number, product: TenantProduct) => sum + Number(product.units_mtd ?? 0), 0)}`,
                sub: 'Operational volume this period',
              }]
            : [{
                label: `Revenue · ${metricSuffix}`,
                value: formatCompactInr(kpis?.revenue_mtd ?? 0),
                sub: `${growth >= 0 ? '↑ +' : '↓ '}${Math.abs(growth)}% vs last month`,
              }]),
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk' as const,
            eyebrow: 'Needs attention',
            hint: `${firstPage?.todays_read?.needs_attention?.length ?? 0}`,
            rows: (firstPage?.todays_read?.needs_attention ?? []).map((row) => ({
              initials: row.brand_initials,
              hue: row.brand_hue,
              name: row.name,
              reason: `${row.status.label} · ${row.on_hand} on hand · ${row.days_cover}d cover`,
              trailing: <GrowthPill value={row.growth_pct} />,
            })),
          },
          ...(isSellerAssistant ? [] : [{
            kind: 'info' as const,
            eyebrow: 'Top performers',
            hint: 'by GMV',
            rows: (firstPage?.todays_read?.top_performers ?? []).map((row) => ({
              initials: row.brand_initials,
              hue: row.brand_hue,
              name: row.name,
              reason: `${row.units_mtd} units · ${row.brand}`,
              trailing: formatCompactInr(row.gmv_mtd),
            })),
          },
          {
            kind: 'opportunity' as const,
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: (firstPage?.todays_read?.top_risers ?? []).map((row) => ({
              initials: row.brand_initials,
              hue: row.brand_hue,
              name: row.name,
              reason: `${row.brand} · ${formatCompactInr(row.gmv_mtd)} ${metricSuffix}`,
              trailing: <GrowthPill value={row.growth_pct} />,
            })),
          }]),
        ]}
      />

      <FilterBar
        count={`${filtered.length} of ${filteredTotal} products`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={groups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={isSellerAssistant ? ['On hand (low → high)'] : [...SORT_OPTIONS]}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />
        </>
      )}

      <LandingTable
        showEmptyState={displayRows.length === 0 && !isLoading}
        emptyState={
          <EmptyState
            icon={<Package size={28} strokeWidth={1.5} />}
            heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching products' : 'No products in your catalog'}
            description={
              search.trim() || groups.some((group) => group.values.length > 0)
                ? 'Try a different search or filter combination.'
                : isSellerAssistant
                  ? 'Products will appear here once your team adds them to the catalog.'
                  : 'Add products to start tracking inventory and revenue.'
            }
            action={
              <Button variant="accent" onClick={() => setAddProductOpen(true)} className="gap-1.5" disabled={isSellerAssistant}>
                <Plus size={13} />
                Add a product
              </Button>
            }
          />
        }
        columns={[
          { label: 'Product', width: 340, className: 'px-5' },
          { label: 'Brand', className: 'px-5' },
          { label: 'On hand', align: 'right', className: 'px-5' },
          { label: 'Days cover', align: 'right', className: 'px-5' },
          { label: `Units · ${metricSuffix}`, align: 'right', className: 'px-5' },
          ...(isSellerAssistant ? [] : [
            { label: 'Revenue', align: 'right' as const, className: 'px-5' },
            { label: 'Growth', className: 'px-5' },
          ]),
          { label: 'Status', className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
      >
        {displayRows.map((product: TenantProduct, index: number) => {
          const brandName = product.brand_name ?? 'Unknown brand';
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = Number(product.days_cover ?? 0);
          const unitsMtd = Number(product.units_mtd ?? 0);
          const gmvMtd = Number(product.gmv_mtd ?? 0);
          const growthPct = Number(product.growth_pct ?? 0);
          const sku = product.master_product?.master_sku ?? product.internal_sku;
          const category = product.category_name ?? 'Uncategorized';
          const tone = product.status_tone ?? (onHand === 0 ? 'danger' : daysCover < 14 ? 'warning' : 'success');
          const label = product.status_label ?? (onHand === 0 ? 'Out of stock' : daysCover < 14 ? 'Low stock' : 'On pace');

          return (
            <tr
              key={product.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/products/${product.id}`)}
            >
              <td className="px-5 py-3.5 text-base text-cream-900">
                <div className="ent flex items-center gap-3">
                  <EntityAvatar
                    initials={getInitials(product.display_name)}
                    hue={getBrandHue(index)}
                    imageUrl={product.image_urls?.[0] ?? null}
                    size={38}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{product.display_name}</p>
                    <p className="mt-0.5 text-sm text-cream-700">
                      {sku} · {toLabelCase(category)}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-base text-cream-900">
                <div className="inline-flex items-center gap-2">
                  <EntityAvatar initials={getInitials(brandName)} hue={getBrandHue(index)} imageUrl={product.master_product?.brand_logo_url ?? null} size={22} />
                  <span className="text-sm text-cream-900">{brandName}</span>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">{onHand}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {daysCover === 0 ? (
                  <span className="font-semibold text-danger-700">0d</span>
                ) : daysCover < 7 ? (
                  <span className="font-semibold text-warning-700">{daysCover}d</span>
                ) : (
                  <span>{daysCover}d</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">{unitsMtd}</td>
              {!isSellerAssistant ? (
                <>
                  <td className="px-5 py-3.5 text-right text-base text-cream-900">
                    <span className="font-display text-md font-medium tabular-nums text-cream-900">{formatCompactInr(gmvMtd)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-base text-cream-900">
                    <GrowthPill value={growthPct} />
                  </td>
                </>
              ) : null}
              <td className="px-5 py-3.5 text-base text-cream-900">
                <StatusTag tone={tone} label={label} />
              </td>
              <td className="px-4 py-3.5 text-right text-md text-cream-500">›</td>
            </tr>
          );
        })}
      </LandingTable>

      {/* Scroll sentinel — triggers next-page fetch when within 400px of viewport */}
      <div ref={sentinelRef} className="h-px" aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>
      )}

      {!isSellerAssistant ? <AddProductSheet open={addProductOpen} onOpenChange={setAddProductOpen} hideTrigger /> : null}
    </PageWrap>
  );
}

export function ProductsLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: TenantProductsResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <ProductsLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
