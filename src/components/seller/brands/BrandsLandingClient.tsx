'use client';

import { Fragment, useMemo, useState } from 'react';
import { Plus, Layers } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import {
  useTenantBrands,
  useTenantBrandsMetrics,
  type BrandsLandingKpiCardV4,
  type BrandsLandingMetricsV4,
  type TenantBrand,
  type TenantBrandsLandingSort,
} from '@/hooks/useBrands';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { cn, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { joinSplitListMeta } from '@/lib/seller-split-list-ui';
import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Sales (high → low)' | 'Sales (low → high)' | 'Invoice count (high → low)' | 'Sold products (high → low)' | 'Purchasing customers (high → low)';
type BrandLandingFilters = { status: string[] };

interface BrandVm {
  id: string;
  name: string;
  category: string;
  region: string;
  skus: number;
  gmv: number;
  share: number;
  activeBuyers: number;
  totalBuyers: number;
  invoiceCount: number;
  soldProducts: number;
  daysSinceCatalog: number;
  catalogName: string | null;
  default_cohort_id: string | null;
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
  logoUrl: string | null;
}

const SORT_OPTIONS: SortOption[] = [
  'Sales (high → low)',
  'Sales (low → high)',
  'Invoice count (high → low)',
  'Sold products (high → low)',
  'Purchasing customers (high → low)',
];

const AddBrandCommand = dynamic(
  () => import('@/components/seller/brands/AddBrandCommand').then((mod) => mod.AddBrandCommand),
);

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((segment) => segment[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function toBrandVm(brand: TenantBrand, index: number): BrandVm {
  const name = brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown brand';
  const gmv = brand.gmv_mtd ?? 0;
  const category = brand.categories?.[0] ?? 'Uncategorized';
  const daysSinceCatalog = brand.catalog_days_ago ?? 999;

  return {
    id: brand.id,
    name,
    category,
    region: 'Karnataka',
    skus: brand.sku_count ?? 0,
    gmv,
    share: 0,
    activeBuyers: brand.invoice_buyer_count ?? brand.active_buyers_mtd ?? 0,
    totalBuyers: brand.total_buyers ?? brand.invoice_buyer_count ?? brand.active_buyers_mtd ?? 0,
    invoiceCount: brand.invoice_count ?? 0,
    soldProducts: brand.invoice_product_count ?? 0,
    daysSinceCatalog,
    catalogName: brand.catalog_name ?? null,
    default_cohort_id: brand.default_cohort_id ?? null,
    initials: getInitials(name),
    hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
    logoUrl: brand.logo_url ?? null,
  };
}

function sortKeyFromOption(option: SortOption): TenantBrandsLandingSort {
  if (option === 'Sales (low → high)') return 'invoice_value_asc';
  if (option === 'Invoice count (high → low)') return 'invoice_count_desc';
  if (option === 'Sold products (high → low)') return 'invoice_product_count_desc';
  if (option === 'Purchasing customers (high → low)') return 'invoice_buyer_count_desc';
  return 'invoice_value_desc';
}

function formatCardValue(card: BrandsLandingKpiCardV4): string {
  if (card.id.includes('sales') || card.id.includes('revenue')) {
    return formatNumberValue(card.value, 'CURRENCY_THRESHOLD');
  }
  return formatNumberValue(card.value, 'COUNT');
}

function filtersFromBrandPreset(preset: Record<string, unknown> | null | undefined): BrandLandingFilters {
  if (!preset) return { status: [] };
  if (typeof preset.sold_period === 'string') return { status: ['active'] };
  if (typeof preset.not_sold_period === 'string') return { status: ['dormant'] };
  if (preset.sold_previous_period === true && preset.sold_current_period === false) return { status: ['dormant'] };
  return { status: [] };
}

function BrandLandingContent({
  initialMetrics,
}: {
  initialMetrics: BrandsLandingMetricsV4 | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/brands');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const period: SellerLandingPeriod = 'month';
  const horizonLabel = 'This Month';
  const metricSuffix = 'MTD';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-brands-landing',
    scopeKey: 'v4-this-month',
    pathnameOverride: '/brands',
    version: 5,
    initialState: {
      search: '',
      filter_preset: null as Record<string, unknown> | null,
      filters: { status: [] as string[] },
      sortBy: 'Sales (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filterPreset = routeState.filter_preset ?? null;
  const filters = routeState.filters ?? { status: [] };
  const { data: metricsData } = useTenantBrandsMetrics(initialMetrics);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantBrands(
    period,
    { search, status: filters.status, sort: sortKeyFromOption(sortBy), filter_preset: filterPreset },
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-brands-landing',
    scopeKey: 'v4-this-month',
    pathnameOverride: '/brands',
    ready: !isLoading,
  });
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);

  const brands = useMemo(() => (landingData?.brands ?? []).map(toBrandVm), [landingData?.brands]);
  const kpiCards = metricsData?.cards ?? [];
  const selectedCard = kpiCards.find((card) => card.id === selectedKpiKey) ?? kpiCards[0] ?? null;
  const groups: FilterBarGroup[] = (landingData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof BrandLandingFilters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
      filter_preset: null,
    })),
  }));
  const portfolioGmv = landingData?.portfolio_sales_value ?? brands.reduce((sum, brand) => sum + brand.gmv, 0);
  const updatedBrands = useMemo(
    () => brands.map((brand) => ({ ...brand, share: portfolioGmv > 0 ? Math.round((brand.gmv / portfolioGmv) * 100) : 0 })),
    [brands, portfolioGmv]
  );

  const visibleRows = updatedBrands;
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(visibleRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [visibleRows.length],
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
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && visibleRows.length === 0;
  const selectedOption = selectedCard
    ? {
        label: selectedCard.label,
        value: formatCardValue(selectedCard),
        sub: selectedCard.supporting_text ?? selectedCard.time_basis ?? '',
      }
    : {
        label: 'Brands',
        value: formatNumberValue(visibleRows.length, 'COUNT'),
        sub: horizonLabel,
      };

  if (isError && !landingData) {
    return (
      <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
    );
  }
  const showRefreshingState = isLoading && !data;

  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading brands" showLeading />
    ) : (
      <BrandsLandingSkeleton />
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
          eyebrow={isPaneOpen ? 'Brands' : 'Portfolio'}
          title={isPaneOpen ? selectedOption.label : 'Brands'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${landingData?.total ?? visibleRows.length} brands · This month invoice performance.`}
          horizon={horizonLabel}
          primary="Add a brand"
          onPrimaryClick={() => setAddBrandOpen(true)}
          compact={isPaneOpen}
        />

        {isPaneOpen ? null : (
          <InsightStrip4
            tiles={kpiCards.map((option): InsightTile => ({
              label: option.label,
              value: formatCardValue(option),
              sub: option.supporting_text ?? option.time_basis ?? '',
              onClick: () => {
                setSelectedKpiKey(option.id);
                setRouteState((current) => ({
                  ...current,
                  filter_preset: option.filter_preset ?? null,
                  filters: filtersFromBrandPreset(option.filter_preset),
                }));
              },
              selected: option.id === selectedKpiKey,
            }))}
          />
        )}

        <FilterBar
          count={`${visibleRows.length} brands`}
          searchPlaceholder="Search brand…"
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
        <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
      ) : (
        <>
      {showTableSkeleton ? (
        isPaneOpen ? (
          <SplitPaneListRowsSkeleton isPaneOpen showLeading />
        ) : (
          <LandingTableRowsSkeleton columns={8} tableMinWidth={1500} />
        )
      ) : (
      <LandingTable
        showEmptyState={visibleRows.length === 0 && !isLoading}
        emptyState={
          <EmptyState
            icon={<Layers size={28} strokeWidth={1.5} />}
            heading={
              search.trim() || filterPreset
                ? 'No matching brands'
                : 'No brands in your portfolio'
            }
            description={
              search.trim() || filterPreset
                ? 'Try a different search or filter.'
                : 'Add your first brand to start building your catalog and pricing.'
            }
            action={
              <Button variant="accent" onClick={() => setAddBrandOpen(true)} className="inline-flex items-center gap-1.5">
                <Plus size={13} />
                Add a brand
              </Button>
            }
          />
        }
        columns={[
          { label: 'Brand', minWidth: 320, maxWidth: 420, className: 'px-5' },
          { label: 'Product count', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 180, className: 'px-5' },
          { label: 'Invoice count', align: 'right', minWidth: 130, maxWidth: 160, className: 'px-5' },
          { label: 'Sold products', align: 'right', minWidth: 130, maxWidth: 160, className: 'px-5' },
          { label: 'Share of portfolio', align: 'right', minWidth: 160, maxWidth: 200, className: 'px-5' },
          { label: 'Purchasing customers', align: 'right', minWidth: 150, maxWidth: 190, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1500}
        forceCompact={isPaneOpen}
        sentinelIndex={sentinelIndex}
        sentinelRef={sentinelRef}
        mobileRows={visibleRows.map((brand) => ({
          id: brand.id,
          href: `/brands/${brand.id}`,
          leading: (
            <EntityAvatar initials={brand.initials} hue={brand.hue} imageUrl={brand.logoUrl} size={32} />
          ),
          eyebrow: brand.category,
          primary: brand.name,
          supporting: joinSplitListMeta(`${brand.skus} products`, `${brand.invoiceCount} invoices`),
          trailing: formatNumberValue(brand.gmv, 'CURRENCY_THRESHOLD'),
          selected: brand.id === openId,
        }))}
      >
        {visibleRows.map((brand, index) => (
          <Fragment key={brand.id}>
          {index === sentinelIndex ? (
            <tr aria-hidden="true" style={{ height: 0 }}>
              <td colSpan={8} className="p-0"><div ref={sentinelRef} /></td>
            </tr>
          ) : null}
          <tr
            className={cn(
              'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
              brand.id === openId ? 'bg-ember-50' : 'bg-white',
            )}
            onClick={() => router.push(`/brands/${brand.id}`)}
            onPointerDown={() => triggerHaptic()}
          >
            <td className="px-3 py-3 text-base text-cream-900">
              <div className="ent flex items-center gap-3">
                <EntityAvatar initials={brand.initials} hue={brand.hue} imageUrl={brand.logoUrl} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-cream-900">{brand.name}</p>
                  <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{brand.skus} products</p>
                </div>
              </div>
            </td>
            <td className="px-3 py-3 text-right font-mono text-base text-cream-900 tabular-nums">
              {brand.skus}
            </td>
            <td className="px-3 py-3 text-right text-base text-cream-900">
              <span className="font-display text-md font-medium text-cream-900 tabular-nums">{formatNumberValue(brand.gmv, 'CURRENCY_THRESHOLD')}</span>
            </td>
            <td className="px-3 py-3 text-right font-mono text-base text-cream-900 tabular-nums">
              {brand.invoiceCount}
            </td>
            <td className="px-3 py-3 text-right font-mono text-base text-cream-900 tabular-nums">
              {brand.soldProducts}
            </td>
            <td className="px-3 py-3 text-right text-base text-cream-900">
              <div className="mb-1 h-[5px] w-[184px] overflow-hidden rounded-full bg-cream-200">
                <div
                  className={`h-[5px] rounded-full ${brand.hue === 'ember' ? 'bg-ember-400' : brand.hue === 'cream' ? 'bg-cream-600' : 'bg-teal-500'}`}
                  style={{ width: `${Math.max(0, Math.min(100, brand.share))}%` }}
                />
              </div>
              <p className="font-mono text-xs text-cream-700">{brand.share}% of {formatNumberValue(portfolioGmv, 'CURRENCY_THRESHOLD')}</p>
            </td>
            <td className="px-3 py-3 text-right font-mono text-base text-cream-900 tabular-nums">
              {brand.activeBuyers}
            </td>
            <td className="chev px-3 py-3 pr-4 text-right text-md text-cream-500">›</td>
          </tr>
          </Fragment>
        ))}
      </LandingTable>
      )}

      <AddBrandCommand open={addBrandOpen} onOpenChange={setAddBrandOpen} hideTrigger />
        </>
      )}
      </div>
    </PageWrap>
  );
}

export function BrandsLandingClient({
  initialMetrics,
}: {
  initialMetrics: BrandsLandingMetricsV4 | null;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <BrandLandingContent initialMetrics={initialMetrics} />
    </FeatureGate>
  );
}
