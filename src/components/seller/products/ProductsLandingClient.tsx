'use client';

import { Fragment, useDeferredValue, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import dynamic from 'next/dynamic';
import { Upload, Plus, Package } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { useTenantProducts, useTenantProductsInfinite, type TenantProduct, type TenantProductsResponse } from '@/hooks/useProducts';
import { cn, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';

const AddProductSheet = dynamic(
  () => import('@/components/seller/products/AddProductSheet').then((m) => m.AddProductSheet),
  { ssr: false },
);

type SortOption = 'Sales (high → low)' | 'Sales (low → high)' | 'Stock on hand (low → high)';

const SORT_OPTIONS: SortOption[] = ['Sales (high → low)', 'Sales (low → high)', 'Stock on hand (low → high)'];

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

function dedupeProductsById(products: TenantProduct[]): TenantProduct[] {
  const seen = new Set<string>();

  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }

    seen.add(product.id);
    return true;
  });
}

function matchesProductSearch(product: TenantProduct, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    product.display_name,
    product.internal_sku,
    product.brand_name,
    product.category_name,
    product.master_product?.master_sku ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function ProductLandingDataSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-[14px]" />
      <Skeleton className="h-[28rem] rounded-[14px]" />
    </div>
  );
}

function ProductsLandingContent({
  initialData,
}: {
  initialData: TenantProductsResponse | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = openId != null;
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const { isSellerAssistant } = useRole();
  const period = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const summaryQuery = useTenantProducts(period, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-products-landing',
    scopeKey: period,
    pathnameOverride: '/products',
    version: 3,
    initialState: {
      search: '',
      sortBy: 'Sales (high → low)' as SortOption,
      filters: {
        brand: [] as string[],
        category: [] as string[],
        status: [] as string[],
        stock: [] as string[],
      },
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { brand: [], category: [], status: [], stock: [] };
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('invoiced-sales');

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantProductsInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters },
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
    pathnameOverride: '/products',
    ready: !isLoading,
  });

  // Flatten all pages into a single products list
  const allProducts = useMemo(() => dedupeProductsById(data?.pages?.flatMap((p) => p.products) ?? []), [data?.pages]);
  // Total count from snapshot (O(1)); falls back to loaded count
  const firstPage = data?.pages?.[0];
  const filteredTotal = (firstPage as { total?: number | null } | undefined)?.total ?? firstPage?.kpis?.total_skus ?? allProducts.length;
  const summaryProducts = summaryData?.products ?? [];
  const summaryTotal = summaryData?.kpis?.total_skus ?? summaryProducts.length;
  const summaryBrands = summaryData?.brands?.length ?? 0;

  const filtered = useMemo(() => {
    const locallyFiltered = allProducts.filter((product) => {
      if (!matchesProductSearch(product, search)) {
        return false;
      }

      if (filters.brand.length > 0 && (!product.brand_name || !filters.brand.includes(product.brand_name))) {
        return false;
      }

      if (filters.category.length > 0 && (!product.category_name || !filters.category.includes(product.category_name))) {
        return false;
      }

      if (
        filters.status.length > 0 &&
        !filters.status.some((value) => (value === 'Active' ? product.is_active : !product.is_active))
      ) {
        return false;
      }

      if (
        filters.stock.length > 0 &&
        !filters.stock.some((value) => {
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = product.days_cover ?? null;
          if (value === 'Out of stock') return onHand === 0;
          if (value === 'Low stock') return onHand > 0 && daysCover != null && daysCover < 14;
          if (value === 'In stock') return onHand > 0 && (daysCover == null || daysCover >= 14);
          return false;
        })
      ) {
        return false;
      }

      return true;
    });

    return [...locallyFiltered].sort((a, b) => {
        if (!isSellerAssistant && sortBy === 'Sales (high → low)') return Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0);
        if (!isSellerAssistant && sortBy === 'Sales (low → high)') return Number(a.gmv_mtd ?? 0) - Number(b.gmv_mtd ?? 0);
        return Number(a.on_hand ?? 0) - Number(b.on_hand ?? 0);
      });
  }, [allProducts, filters.brand, filters.category, filters.status, filters.stock, isSellerAssistant, search, sortBy]);
  const displayRows = filtered;
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(displayRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [displayRows.length],
  );
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && displayRows.length === 0;

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
  const showRefreshingState = isLoading && !data;

  const kpis = summaryData?.kpis;
  const recentlySoldOutOfStock = kpis?.recently_sold_out_of_stock ?? 0;
  const lowStock = kpis?.low_stock ?? summaryProducts.filter((p) => Number(p.on_hand ?? 0) > 0 && Number(p.days_cover ?? 0) < 14).length;
  const productsSold = kpis?.products_sold ?? summaryProducts.filter((product) => Number(product.units_mtd ?? 0) > 0).length;
  const categoryCount = kpis?.category_count ?? 0;
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

  const kpiOptions = [
    {
      id: 'invoiced-sales',
      label: `Invoiced sales · ${metricSuffix}`,
      value: formatNumberValue(kpis?.revenue_mtd ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${kpis?.units_mtd ?? summaryProducts.reduce((sum: number, product: TenantProduct) => sum + Number(product.units_mtd ?? 0), 0)} units sold`,
    },
    {
      id: 'products-sold',
      label: 'Products that sold · 90D',
      value: `${productsSold}`,
      sub: `${Math.round((productsSold/summaryTotal)*100)}% of all products`,
    },
    {
      id: 'recently-out-of-stock',
      label: 'Recently sold products out of stock',
      value: `${recentlySoldOutOfStock}`,
      sub: `${Math.round((recentlySoldOutOfStock/productsSold)*100)}% of products that sold`,
    },
    {
      id: 'products-running-low',
      label: 'Products running low',
      value: `${lowStock}`,
      sub: `${Math.round((lowStock/summaryTotal)*100)}% of all products`,
    },
  ];
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <PageHeader
          eyebrow={isPaneOpen ? 'Products' : 'Catalog'}
          title={isPaneOpen ? selectedOption.label : 'Products'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${summaryTotal} active products across ${summaryBrands} brands and ${categoryCount} categories.`}
          horizon={horizonLabel}
          showHorizonControl={false}
        secondary={{
          label: 'Bulk import',
          icon: <Upload size={13} />,
          onClick: () => router.push('/products/import'),
        }}
        {...(isSellerAssistant ? {} : {
          primary: 'Add a product',
          onPrimaryClick: () => setAddProductOpen(true),
        })}
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
        count={`${filtered.length} of ${filteredTotal} products${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        compact={isPaneOpen}
        groups={groups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />
        </>
      )}
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {showRefreshingState ? (
        <ProductLandingDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load products"
          description="There was a problem fetching your products. Please try again."
        />
      ) : (
        <>
      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={10} tableMinWidth={1720} />
      ) : (
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
          { label: 'Product', width: 320, minWidth: 320, maxWidth: 420, className: 'px-5' },
          { label: 'Brand', width: 200, minWidth: 200, maxWidth: 260, className: 'px-5' },
          { label: 'Category', width: 150, minWidth: 150, maxWidth: 220, className: 'px-5' },
          { label: 'Status', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: 'Available stock', align: 'right', width: 140, minWidth: 140, maxWidth: 180, className: 'px-5' },
          { label: 'Stock days left', align: 'right', width: 130, minWidth: 130, maxWidth: 160, className: 'px-5' },
          { label: `Units sold · ${metricSuffix}`, align: 'right', width: 140, minWidth: 140, maxWidth: 180, className: 'px-5' },
          { label: `Sales · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 140, maxWidth: 180, className: 'px-5' },
          { label: 'Stock status', width: 150, minWidth: 150, maxWidth: 190, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1800}
        forceCompact={isPaneOpen}
        sentinelIndex={sentinelIndex}
        sentinelRef={sentinelRef}
        mobileRows={displayRows.map((product: TenantProduct) => {
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = product.days_cover ?? null;
          const sku = product.master_product?.master_sku ?? product.internal_sku;
          return {
            id: product.id,
            href: `/products/${product.id}`,
            primary: product.display_name,
            supporting: `${sku} · ${product.brand_name ?? 'Unknown brand'}`,
            meta: `${product.category_name ? toLabelCase(product.category_name) : 'Uncategorized'} · ${daysCover == null ? 'No cover data' : `${Math.round(daysCover)}d cover`}`,
            trailing: `${onHand} on hand`,
            selected: product.id === openId,
          };
        })}
        >
          {displayRows.map((product: TenantProduct, index: number) => {
          const brandName = product.brand_name ?? 'Unknown brand';
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = product.days_cover ?? null;
          const unitsMtd = Number(product.units_mtd ?? 0);
          const gmvMtd = Number(product.gmv_mtd ?? 0);
          const sku = product.master_product?.master_sku ?? product.internal_sku;
          const category = product.category_name ?? '-';
          const uom = product.default_uom ?? 'units';
          const tone = product.status_tone ?? (onHand === 0 ? 'danger' : daysCover != null && daysCover < 14 ? 'warning' : 'success');
          const label = product.status_label ?? (onHand === 0 ? 'Out of stock' : daysCover != null && daysCover < 14 ? 'Low stock' : 'On pace');

          return (
            <Fragment key={product.id}>
            {index === sentinelIndex ? (
              <tr aria-hidden="true" style={{ height: 0 }}>
                <td colSpan={10} className="p-0"><div ref={sentinelRef} /></td>
              </tr>
            ) : null}
            <tr
              className={cn(
                'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
                product.id === openId ? 'bg-ember-50' : 'bg-white',
              )}
              onClick={() => router.push(`/products/${product.id}`)}
              onPointerDown={() => triggerHaptic()}
            >
              <td className="px-3 py-2 text-base text-cream-900">
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
                      {sku}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-base text-cream-900">
                <div className="inline-flex items-center gap-2">
                  <EntityAvatar initials={getInitials(brandName)} hue={getBrandHue(index)} imageUrl={product.master_product?.brand_logo_url ?? null} size={22} />
                  <span className="text-sm text-cream-900">{brandName}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-base text-cream-900">
                <span className="text-sm text-cream-900">{toLabelCase(category)}</span>
              </td>
              <td className="px-3 py-2 text-base text-cream-900">
                <StatusTag tone={product.is_active ? 'success' : 'neutral'} label={product.is_active ? 'Active' : 'Inactive'} />
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex flex-col items-end">
                  <span className="font-mono text-base tabular-nums text-cream-900">{onHand}</span>
                  <span className="mt-1 text-xs text-cream-500">{uom}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">
                <div className="flex flex-col items-end">
                  {daysCover == null ? (
                    <span className="text-cream-500">—</span>
                  ) : daysCover === 0 ? (
                    <span className="font-semibold text-danger-700">0d</span>
                  ) : daysCover < 7 ? (
                    <span className="font-semibold text-warning-700">{Math.round(daysCover)}d</span>
                  ) : (
                    <span>{Math.round(daysCover)}d</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">{unitsMtd}</td>
              <td className="px-3 py-2 text-right text-base text-cream-900">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">{formatNumberValue(gmvMtd, 'CURRENCY_THRESHOLD')}</span>
              </td>
              <td className="px-3 py-2 text-base text-cream-900">
                <StatusTag tone={tone} label={label} />
              </td>
              <td className="px-3 py-2 text-right text-md text-cream-500">›</td>
            </tr>
            </Fragment>
          );
          })}
        </LandingTable>
      )}

      {!isSellerAssistant ? <AddProductSheet open={addProductOpen} onOpenChange={setAddProductOpen} hideTrigger /> : null}
        </>
      )}
      </div>
    </PageWrap>
  );
}

export function ProductsLandingClient({
  initialData,
}: {
  initialData: TenantProductsResponse | null;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <ProductsLandingContent initialData={initialData} />
    </FeatureGate>
  );
}
