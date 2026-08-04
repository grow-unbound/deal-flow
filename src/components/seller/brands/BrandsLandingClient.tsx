'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { UserPlus, Plus, Layers } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { triggerHaptic } from '@/lib/haptics';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useTenantBrands, type TenantBrand, type TenantBrandsResponse } from '@/hooks/useBrands';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { cn, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import { SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { joinSplitListMeta } from '@/lib/seller-split-list-ui';

type SortOption = 'Sales (high → low)' | 'Sales (low → high)' | 'Campaign age (most recent)';

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
  daysSinceCatalog: number;
  catalogName: string | null;
  default_cohort_id: string | null;
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
  logoUrl: string | null;
}

const SORT_OPTIONS: SortOption[] = ['Sales (high → low)', 'Sales (low → high)', 'Campaign age (most recent)'];
const PAGE_SIZE = 20;

const AddBrandCommand = dynamic(
  () => import('@/components/seller/brands/AddBrandCommand').then((mod) => mod.AddBrandCommand),
);
const InviteUserDialog = dynamic(
  () => import('@/components/seller/InviteUserDialog').then((mod) => mod.InviteUserDialog),
);

function BrandLandingDataSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-[14px]" />
      <LandingTableRowsSkeleton columns={6} tableMinWidth={1400} />
    </div>
  );
}

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
    activeBuyers: brand.active_buyers_mtd ?? 0,
    totalBuyers: brand.total_buyers ?? 0,
    daysSinceCatalog,
    catalogName: brand.catalog_name ?? null,
    default_cohort_id: brand.default_cohort_id ?? null,
    initials: getInitials(name),
    hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
    logoUrl: brand.logo_url ?? null,
  };
}

function BrandLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: TenantBrandsResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/brands');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const lowerLabel = 'in the last 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-brands-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/brands',
    version: 4,
    initialState: {
      search: '',
      filters: {
        categories: [] as string[],
        cohorts: [] as string[],
      },
      sortBy: 'Sales (high → low)' as SortOption,
      visibleCount: PAGE_SIZE,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { categories: [], cohorts: [] };
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantBrands(period, { search, categories: filters.categories, cohorts: filters.cohorts }, initialData ?? undefined);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-brands-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/brands',
    ready: !isLoading,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('portfolio-gmv');
  const visibleCount = routeState.visibleCount;
  const hasTableControls = Boolean(search.trim() || filters.categories.length > 0 || filters.cohorts.length > 0);

  const brands = useMemo(() => (landingData?.brands ?? []).map(toBrandVm), [landingData?.brands]);
  const summaryData = useRetainedValue<TenantBrandsResponse | undefined>(
    !hasTableControls ? landingData : initialData ?? undefined,
  );
  const portfolioGmv = useMemo(
    () => summaryData?.kpis?.portfolio_gmv_mtd ?? brands.reduce((sum, brand) => sum + brand.gmv, 0),
    [brands, summaryData?.kpis?.portfolio_gmv_mtd]
  );
  // portfolio_gmv_mtd is order/estimate demand value (spec §6 rule 7), not invoiced sales —
  // label accordingly instead of the previous hardcoded, misleading "Invoiced sales" text.
  const primaryDemandKind = summaryData?.primary_demand_kind ?? 'orders';
  const portfolioGmvLabel = primaryDemandKind === 'estimates' ? 'Estimate demand value · 90D' : 'Order demand value · 90D';
  const updatedBrands = useMemo(
    () => brands.map((brand) => ({ ...brand, share: portfolioGmv > 0 ? Math.round((brand.gmv / portfolioGmv) * 100) : 0 })),
    [brands, portfolioGmv]
  );

  const categoryOptions = useMemo(() => {
    const values = Array.from(new Set(['Uncategorized', ...(landingData?.categories ?? [])]));
    return values.sort((a, b) => a.localeCompare(b));
  }, [landingData?.categories]);
  const cohortOptions = useMemo(
    () => (landingData?.cohorts ?? []).map((cohort) => ({ value: cohort.id, label: cohort.name })),
    [landingData?.cohorts],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return updatedBrands
      .filter((brand) => filters.categories.length === 0 || filters.categories.includes(brand.category || 'Uncategorized'))
      .filter((brand) => filters.cohorts.length === 0 || (brand.default_cohort_id ? filters.cohorts.includes(brand.default_cohort_id) : false))
      .filter((brand) => {
      if (!query) return true;
      return brand.name.toLowerCase().includes(query) || brand.category.toLowerCase().includes(query);
      })
      .sort((a, b) => {
      if (sortBy === 'Sales (high → low)') return b.gmv - a.gmv;
      if (sortBy === 'Sales (low → high)') return a.gmv - b.gmv;
      return a.daysSinceCatalog - b.daysSinceCatalog;
      });
  }, [filters.categories, filters.cohorts, search, sortBy, updatedBrands]);

  useEffect(() => {
    setRouteState((current) => ({ ...current, visibleCount: PAGE_SIZE }));
  }, [filters.categories, filters.cohorts, search, sortBy]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(visibleRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [visibleRows.length],
  );
  const hasMore = visibleCount < filtered.length || Boolean(hasNextPage);
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading: isFetchingNextPage,
    onLoadMore: () => {
      if (visibleCount < filtered.length) {
        setRouteState((current) => ({
          ...current,
          visibleCount: Math.min(current.visibleCount + PAGE_SIZE, filtered.length),
        }));
      } else if (hasNextPage) {
        void fetchNextPage();
      }
    },
  });

  const catalogFresh =
    summaryData?.kpis?.catalog_freshness_count ?? updatedBrands.filter((brand) => brand.daysSinceCatalog <= 14).length;
  const activeBuyers = summaryData?.kpis?.buyers_with_orders_mtd ?? 0;
  const totalBuyers = summaryData?.kpis?.total_buyers ?? 0;

  const freshnessHelp = () => {
    const days = summaryData?.kpis?.catalog_freshness_earliest_days;
    const fresh = summaryData?.kpis?.catalog_freshness_count ?? 0;
    const total = summaryData?.kpis?.total_campaigns ?? 0;
    const denom = `${fresh}/${total} catalogs`;
    if (days == null) return `${denom} published ${lowerLabel}`;
    if (days === 0) return `${denom} published today`;
    if (days === 1) return `${denom} published yesterday`;
    return `${denom} published in the last ${days} days`;
  };
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filtered.length === 0;

  const kpiOptions = [
    {
      id: 'portfolio-gmv',
      label: portfolioGmvLabel,
      value: formatNumberValue(portfolioGmv, 'CURRENCY_THRESHOLD'),
      sub: horizonLabel,
    },
    {
      id: 'active-brands',
      label: 'Active brands',
      value: `${summaryData?.kpis?.brands_carried ?? updatedBrands.length}`,
      sub: `${activeBuyers} of ${totalBuyers} customers purchased`,
    },
    {
      id: 'recent-campaigns',
      label: 'Recently active in campaigns',
      value: `${catalogFresh}`,
      sub: freshnessHelp(),
    },
  ];
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

  // No early full-page skeleton swap: the real PageHeader/StickyListHeader/FilterBar
  // render immediately below (their content is either static or already null-safe),
  // and `showRefreshingState`/`showTableSkeleton` cover the data-dependent regions
  // (KPI strip, table rows) with placeholders — so title/CTAs/table headers show up
  // instantly instead of being replaced by a disconnected generic skeleton component.
  if (isError && !landingData) {
    return (
      <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
    );
  }
  const showRefreshingState = isLoading && !data;

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
            : `${summaryData?.kpis?.brands_carried ?? updatedBrands.length} active brands · ${summaryData?.branded_product_count ?? 0} of ${summaryData?.active_product_count ?? 0} active products branded.`}
          horizon={horizonLabel}
          primary="Add a brand"
          onPrimaryClick={() => setAddBrandOpen(true)}
          compact={isPaneOpen}
        />

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
          count={`${filtered.length} brands`}
          searchPlaceholder="Search brand or category…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          compact={isPaneOpen}
          groups={[
            {
              key: 'categories',
              label: 'Categories',
              options: categoryOptions.map((value) => ({ value, label: value })),
              values: filters.categories,
              onChange: (values) => setRouteState((current) => ({
                ...current,
                filters: { ...(current.filters ?? filters), categories: values, cohorts: current.filters?.cohorts ?? filters.cohorts },
              })),
            },
            {
              key: 'cohorts',
              label: 'Customer Groups',
              options: cohortOptions,
              values: filters.cohorts,
              onChange: (values) => setRouteState((current) => ({
                ...current,
                filters: { ...(current.filters ?? filters), categories: current.filters?.categories ?? filters.categories, cohorts: values },
              })),
            },
          ]}
          searchValue={search}
          onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
          sortOptions={[...SORT_OPTIONS]}
          onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
        />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {showRefreshingState ? (
        isPaneOpen ? (
          <SplitPaneListRowsSkeleton isPaneOpen showLeading />
        ) : (
          <BrandLandingDataSkeleton />
        )
      ) : isError ? (
        <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
      ) : (
        <>
      {showTableSkeleton ? (
        isPaneOpen ? (
          <SplitPaneListRowsSkeleton isPaneOpen showLeading />
        ) : (
          <LandingTableRowsSkeleton columns={6} tableMinWidth={1400} />
        )
      ) : (
      <LandingTable
        showEmptyState={filtered.length === 0 && !isLoading}
        emptyState={
          <EmptyState
            icon={<Layers size={28} strokeWidth={1.5} />}
            heading={
              search.trim() || filters.categories.length > 0 || filters.cohorts.length > 0
                ? 'No matching brands'
                : 'No brands in your portfolio'
            }
            description={
              search.trim() || filters.categories.length > 0 || filters.cohorts.length > 0
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
          { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 180, className: 'px-5' },
          { label: 'Share of portfolio', align: 'right', minWidth: 160, maxWidth: 200, className: 'px-5' },
          { label: 'Customers who purchased', align: 'right', minWidth: 150, maxWidth: 190, className: 'px-5' },
          { label: 'Recent campaign', minWidth: 220, maxWidth: 280, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1400}
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
          supporting: joinSplitListMeta(`${brand.skus} SKUs`, brand.catalogName ?? 'No published campaign'),
          trailing: formatNumberValue(brand.gmv, 'CURRENCY_THRESHOLD'),
          selected: brand.id === openId,
        }))}
      >
        {visibleRows.map((brand, index) => (
          <Fragment key={brand.id}>
          {index === sentinelIndex ? (
            <tr aria-hidden="true" style={{ height: 0 }}>
              <td colSpan={6} className="p-0"><div ref={sentinelRef} /></td>
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
                  <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{brand.skus} SKUs</p>
                </div>
              </div>
            </td>
            <td className="px-3 py-3 text-right text-base text-cream-900">
              <span className="font-display text-md font-medium text-cream-900 tabular-nums">{formatNumberValue(brand.gmv, 'CURRENCY_THRESHOLD')}</span>
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
              {brand.activeBuyers}<span className="text-cream-600"> / {brand.totalBuyers}</span>
            </td>
            <td className="px-3 py-3 text-base text-cream-900">
              <p className="truncate text-sm text-cream-900">{brand.catalogName ?? 'No published campaign'}</p>
            </td>
            <td className="chev px-3 py-3 pr-4 text-right text-md text-cream-500">›</td>
          </tr>
          </Fragment>
        ))}
      </LandingTable>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AddBrandCommand open={addBrandOpen} onOpenChange={setAddBrandOpen} hideTrigger />
        </>
      )}
      </div>
    </PageWrap>
  );
}

export function BrandsLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: TenantBrandsResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <BrandLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
