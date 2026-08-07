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
import { SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRole } from '@/hooks/useRole';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import {
  useTenantProductsInfinite,
  useTenantProductsLandingMetrics,
  type ProductLandingSort,
  type ProductsLandingKpiCardV4,
  type ProductsLandingMetricsV4,
  type TenantProduct,
} from '@/hooks/useProducts';
import { cn, formatNumberValue } from '@/lib/utils';
import { PRODUCTS_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import { joinSplitListMeta } from '@/lib/seller-split-list-ui';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { ProductsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

const AddProductSheet = dynamic(
  () => import('@/components/seller/products/AddProductSheet').then((m) => m.AddProductSheet),
  { ssr: false },
);

type SortOption = 'Sales (high → low)' | 'Sales (low → high)' | 'Sold units (high → low)' | 'Demand orders (high → low)' | 'Demand estimates (high → low)' | 'Stock on hand (low → high)';
type ProductLandingFilters = { brand: string[]; category: string[]; status: string[]; stock: string[] };

const SORT_OPTIONS: SortOption[] = [
  'Sales (high → low)',
  'Sales (low → high)',
  'Sold units (high → low)',
  'Demand orders (high → low)',
  'Demand estimates (high → low)',
  'Stock on hand (low → high)',
];

const SORT_TO_API: Record<SortOption, ProductLandingSort> = {
  'Sales (high → low)': 'invoice_value_desc',
  'Sales (low → high)': 'invoice_value_asc',
  'Sold units (high → low)': 'invoice_units_desc',
  'Demand orders (high → low)': 'order_value_desc',
  'Demand estimates (high → low)': 'estimate_value_desc',
  'Stock on hand (low → high)': 'stock_on_hand_asc',
};

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

function filtersFromProductPreset(preset: Record<string, unknown> | null | undefined): ProductLandingFilters {
  const filters: ProductLandingFilters = { brand: [], category: [], status: [], stock: [] };
  if (!preset) return filters;
  if (typeof preset.sold_period === 'string') filters.status = ['active'];
  if (typeof preset.not_sold_period === 'string') filters.status = ['dormant'];
  if (preset.stock === 'out' || preset.stock_lte === 0) filters.stock = ['out_of_stock'];
  else if (preset.stock === 'low') filters.stock = ['low_stock'];
  else if (preset.stock === 'available' || typeof preset.stock_gt === 'number') filters.stock = ['in_stock'];
  return filters;
}

function ProductsLandingContent({
  initialMetrics,
}: {
  initialMetrics: ProductsLandingMetricsV4 | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/products');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const { isSellerAssistant } = useRole();
  const period = 'quarter';
  const horizonLabel = 'This quarter';
  const metricSuffix = 'QTD';
  const metricsQuery = useTenantProductsLandingMetrics(initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-products-landing',
    scopeKey: period,
    pathnameOverride: '/products',
    version: 4,
    initialState: {
      search: '',
      sortBy: 'Sales (high → low)' as SortOption,
      filterPreset: null as Record<string, unknown> | null,
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
  const filterPreset = routeState.filterPreset ?? null;
  const filters: ProductLandingFilters = routeState.filters ?? { brand: [], category: [], status: [], stock: [] };
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantProductsInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters, sort: SORT_TO_API[sortBy], filter_preset: filterPreset },
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

  const allProducts = useMemo(() => dedupeProductsById(data?.pages?.flatMap((p) => p.products) ?? []), [data?.pages]);
  const firstPage = data?.pages?.[0];
  const filteredTotal = (firstPage as { total?: number | null } | undefined)?.total ?? allProducts.length;
  const filterMeta = firstPage?.filters;
  const summaryBrands = filterMeta?.groups?.find((group) => group.key === 'brand')?.options.length ?? 0;
  const categoryCount = filterMeta?.groups?.find((group) => group.key === 'category')?.options.length ?? 0;
  const displayRows = allProducts;
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

  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading products" showLeading />
    ) : (
      <ProductsLandingSkeleton />
    );
  }

  const groups: FilterBarGroup[] = (filterMeta?.groups ?? []).map((group) => ({
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

  const kpiOptions = (metricsData?.cards ?? []).map((card: ProductsLandingKpiCardV4) => ({
    id: card.id,
    label: kpiLabel(PRODUCTS_KPI_COPY, card),
    value: formatNumberValue(card.value ?? card.entity_count ?? 0, 'COUNT'),
    sub: kpiSupportingText(PRODUCTS_KPI_COPY, card),
    filterPreset: card.filter_preset ?? null,
  }));
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0] ?? {
    id: 'products',
    label: 'Products',
    value: `${filteredTotal}`,
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
          eyebrow={isPaneOpen ? 'Products' : 'Catalog'}
          title={isPaneOpen ? selectedOption.label : 'Products'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${filteredTotal} products across ${summaryBrands} brands and ${categoryCount} categories.`}
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
                filters: filtersFromProductPreset(option.filterPreset),
              }));
            },
            selected: option.id === selectedKpiKey,
          }))}
        />
      )}

      <FilterBar
        count={`${displayRows.length} of ${filteredTotal} products${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
        searchPlaceholder="Search product, SKU, brand…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        compact={isPaneOpen}
        groups={groups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value, filterPreset: null }))}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {isError ? (
        <ErrorState
          heading="Couldn't load products"
          description="There was a problem fetching your products. Please try again."
        />
      ) : (
        <>
      {showTableSkeleton ? (
        isPaneOpen ? (
          <SplitPaneListRowsSkeleton isPaneOpen showLeading />
        ) : (
          <LandingTableRowsSkeleton columns={11} tableMinWidth={1540} />
        )
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
          { label: 'Status', width: 120, minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: 'Available stock', align: 'right', width: 180, minWidth: 140, maxWidth: 200, className: 'px-5' },
          { label: 'Stock days left', align: 'right', width: 160, minWidth: 130, maxWidth: 200, className: 'px-5' },
          { label: `Sales · ${metricSuffix}`, align: 'right' as const, width: 180, minWidth: 140, maxWidth: 200, className: 'px-5' },
          { label: `Invoices · ${metricSuffix}`, align: 'right', width: 150, minWidth: 120, maxWidth: 180, className: 'px-5' },
          { label: `Sold units · ${metricSuffix}`, align: 'right', width: 170, minWidth: 130, maxWidth: 190, className: 'px-5' },
          { label: 'Purchasing customers', align: 'right', width: 190, minWidth: 150, maxWidth: 210, className: 'px-5' },
          { label: 'Demand', align: 'right', width: 220, minWidth: 180, maxWidth: 260, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1540}
        forceCompact={isPaneOpen}
        sentinelIndex={sentinelIndex}
        sentinelRef={sentinelRef}
        mobileRows={displayRows.map((product: TenantProduct, index: number) => {
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = product.days_cover ?? null;
          const sku = product.master_product?.master_sku ?? product.internal_sku;
          return {
            id: product.id,
            href: `/products/${product.id}`,
            leading: (
              <EntityAvatar
                initials={getInitials(product.display_name)}
                hue={getBrandHue(index)}
                imageUrl={product.image_urls?.[0] ?? null}
                size={32}
              />
            ),
            eyebrow: sku,
            primary: product.display_name,
            supporting: joinSplitListMeta(
              product.brand_name ?? 'Unknown brand',
              daysCover == null ? 'No cover data' : `${Math.round(daysCover)}d cover`,
            ),
            trailing: `${onHand}`,
            selected: product.id === openId,
          };
        })}
        >
          {displayRows.map((product: TenantProduct, index: number) => {
          const brandName = product.brand_name ?? 'Unknown brand';
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = product.days_cover ?? null;
          const soldUnits = Number(product.invoice_units ?? product.units_mtd ?? 0);
          const invoiceValue = Number(product.invoice_value ?? product.gmv_mtd ?? 0);
          const invoiceCount = Number(product.invoice_count ?? 0);
          const buyerCount = Number(product.invoice_buyer_count ?? 0);
          const orderValue = Number(product.order_value ?? 0);
          const orderCount = Number(product.order_count ?? 0);
          const estimateValue = Number(product.estimate_value ?? 0);
          const estimateCount = Number(product.estimate_count ?? 0);
          const sku = product.master_product?.master_sku ?? product.internal_sku;
          const category = product.category_name ?? '-';

          return (
            <Fragment key={product.id}>
            {index === sentinelIndex ? (
              <tr aria-hidden="true" style={{ height: 0 }}>
                <td colSpan={11} className="p-0"><div ref={sentinelRef} /></td>
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
              <td className="px-3 py-3 text-base text-cream-900">
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
              <td className="px-3 py-3 text-base text-cream-900">
                <div className="inline-flex items-center gap-2">
                  <EntityAvatar initials={getInitials(brandName)} hue={getBrandHue(index)} imageUrl={product.master_product?.brand_logo_url ?? null} size={22} />
                  <span className="text-sm text-cream-900">{brandName}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-base text-cream-900">
                <StatusTag tone={product.is_active ? 'success' : 'neutral'} label={product.is_active ? 'Active' : 'Inactive'} />
              </td>
              <td className="px-3 py-3 text-right">
                <div className="flex flex-col items-end">
                  <span className="font-mono text-base tabular-nums text-cream-900">{onHand}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
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
              <td className="px-3 py-3 text-right text-base text-cream-900">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">{formatNumberValue(invoiceValue, 'CURRENCY_THRESHOLD')}</span>
              </td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{invoiceCount}</td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{soldUnits}</td>
              <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">{buyerCount}</td>
              <td className="px-3 py-3 text-right text-base text-cream-900">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-display text-md font-medium tabular-nums text-cream-900">
                    {formatNumberValue(orderValue || estimateValue, 'CURRENCY_THRESHOLD')}
                  </span>
                  <span className="text-xs text-cream-600">
                    {orderCount} orders · {estimateCount} estimates
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-right text-md text-cream-500">›</td>
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
  initialMetrics,
}: {
  initialMetrics: ProductsLandingMetricsV4 | null;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <ProductsLandingContent initialMetrics={initialMetrics} />
    </FeatureGate>
  );
}
