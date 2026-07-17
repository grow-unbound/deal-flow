'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Plus, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
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
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useTenantBrands, type TenantBrand, type TenantBrandsResponse } from '@/hooks/useBrands';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { BrandsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'Campaign age (most recent)';

interface BrandVm {
  id: string;
  name: string;
  category: string;
  region: string;
  skus: number;
  gmv: number;
  gmvPrior: number;
  growth: number;
  share: number;
  activeBuyers: number;
  totalBuyers: number;
  daysSinceCatalog: number;
  catalogName: string | null;
  default_cohort_id: string | null;
  alerts: string[];
  initials: string;
  hue: 'teal' | 'ember' | 'cream';
  logoUrl: string | null;
}

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'Campaign age (most recent)'];
const PAGE_SIZE = 20;

const AddBrandCommand = dynamic(
  () => import('@/components/seller/brands/AddBrandCommand').then((mod) => mod.AddBrandCommand),
);
const InviteUserDialog = dynamic(
  () => import('@/components/seller/InviteUserDialog').then((mod) => mod.InviteUserDialog),
);

function BrandLandingSkeleton() {
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

function BrandLandingDataSkeleton() {
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
  const gmvPrior = brand.gmv_prev_mtd ?? 0;
  const growth = brand.growth_pct ?? (gmvPrior > 0 ? Math.round(((gmv - gmvPrior) / gmvPrior) * 100) : 0);
  const category = brand.categories?.[0] ?? 'Uncategorized';
  const alerts = brand.alerts ?? [];
  const daysSinceCatalog = brand.catalog_days_ago ?? 999;

  return {
    id: brand.id,
    name,
    category,
    region: 'Karnataka',
    skus: brand.sku_count ?? 0,
    gmv,
    gmvPrior,
    growth,
    share: 0,
    activeBuyers: brand.active_buyers_mtd ?? 0,
    totalBuyers: brand.total_buyers ?? 0,
    daysSinceCatalog,
    catalogName: brand.catalog_name ?? null,
    default_cohort_id: brand.default_cohort_id ?? null,
    alerts,
    initials: getInitials(name),
    hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
    logoUrl: brand.logo_url ?? null,
  };
}

function BrandLandingContent({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantBrandsResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const lowerLabel = 'in the last 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-brands-landing',
    scopeKey: 'fixed-90d',
    version: 4,
    initialState: {
      search: '',
      filters: {
        categories: [] as string[],
        cohorts: [] as string[],
      },
      sortBy: 'GMV (high → low)' as SortOption,
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
    ready: !isLoading,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
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
      if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
      if (sortBy === 'GMV (low → high)') return a.gmv - b.gmv;
      if (sortBy === 'Growth (high → low)') return b.growth - a.growth;
      return a.daysSinceCatalog - b.daysSinceCatalog;
      });
  }, [filters.categories, filters.cohorts, search, sortBy, updatedBrands]);

  useEffect(() => {
    setRouteState((current) => ({ ...current, visibleCount: PAGE_SIZE }));
  }, [filters.categories, filters.cohorts, search, sortBy]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
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

  const attention = useMemo(() => summaryData?.todays_read?.needs_attention ?? [], [summaryData?.todays_read?.needs_attention]);
  const topPerformers = useMemo(() => summaryData?.todays_read?.top_performers ?? [], [summaryData?.todays_read?.top_performers]);
  const topRisers = useMemo(() => summaryData?.todays_read?.top_risers ?? [], [summaryData?.todays_read?.top_risers]);
  const catalogFresh =
    summaryData?.kpis?.catalog_freshness_count ?? updatedBrands.filter((brand) => brand.daysSinceCatalog <= 14).length;
  const growthVsPrior = useMemo(() => {
    const prior = summaryData?.kpis?.portfolio_gmv_prev_mtd ?? updatedBrands.reduce((sum, brand) => sum + brand.gmvPrior, 0);
    if (prior <= 0) return 0;
    return Math.round(((portfolioGmv - prior) / prior) * 100);
  }, [summaryData?.kpis?.portfolio_gmv_prev_mtd, updatedBrands, portfolioGmv]);
  const activeBuyers = summaryData?.kpis?.buyers_with_orders_mtd ?? 0;
  const totalBuyers = summaryData?.kpis?.total_buyers ?? 0;

  const attentionReason = (alerts: string[]) => {
    const reasons: string[] = [];
    if (alerts.includes('low_stock')) reasons.push('Low stock SKUs (qty <= reorder point)');
    if (alerts.includes('gmv_decline')) reasons.push('GMV is below previous month-to-date');
    if (alerts.includes('not_in_catalog_mtd')) reasons.push(`Not published in any catalog ${lowerLabel}`);
    return reasons.join(' · ');
  };
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

  if (isLoading && !landingData) return <BrandsLandingSkeleton />;
  if (isError && !landingData) {
    return (
      <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
    );
  }
  if (!landingData) return <BrandsLandingSkeleton />;
  const showRefreshingState = isLoading && !data;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Portfolio"
        title="Brands"
        subtitle={`${summaryData?.kpis?.brands_carried ?? updatedBrands.length} brand principals carried across ${totalBuyers} buyers ${lowerLabel}. This is your portfolio at a glance.`}
        horizon={horizonLabel}
        primary="Add a brand"
        onPrimaryClick={() => setAddBrandOpen(true)}
      />

      {showRefreshingState ? (
        <BrandLandingDataSkeleton />
      ) : isError ? (
        <ErrorState heading="Couldn't load brands" description="There was a problem fetching your brands. Please try again." />
      ) : (
        <>
      <InsightStrip4
        tiles={[
          {
            label: 'Portfolio GMV',
            value: formatCompactInr(portfolioGmv),
            sub: `${growthVsPrior >= 0 ? '↑ +' : '↓ '}${Math.abs(growthVsPrior)}% vs prior 90D`,
            tone: 'accent',
          },
          {
            label: 'Brands carried',
            value: `${summaryData?.kpis?.brands_carried ?? updatedBrands.length}`,
            sub: `${activeBuyers} of ${totalBuyers} buyers active`,
          },
          {
            label: 'Need attention',
            value: `${summaryData?.kpis?.need_attention_count ?? attention.length}`,
            sub: `${attention.reduce((sum, brand) => sum + brand.alerts.length, 0)} alerts open`,
            tone: 'warn',
          },
          {
            label: 'Campaign freshness',
            value: `${catalogFresh}`,
            sub: freshnessHelp(),
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs attention',
            hint: `${attention.length} brands`,
            rows: attention.slice(0, 2).map((brand, index) => ({
              initials: getInitials(brand.name),
              hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
              name: brand.name,
              reason: attentionReason(brand.alerts),
              trailing: brand.growth_pct > 0 ? `↑ +${brand.growth_pct}%` : brand.growth_pct < 0 ? `↓ ${Math.abs(brand.growth_pct)}%` : '· flat',
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top performers',
            hint: 'by GMV',
            rows: topPerformers.map((brand, index) => ({
              initials: getInitials(brand.name),
              hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
              name: brand.name,
              reason: `${portfolioGmv > 0 ? Math.round((brand.gmv_mtd / portfolioGmv) * 100) : 0}% of portfolio`,
              trailing: formatCompactInr(brand.gmv_mtd),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: topRisers.map((brand, index) => ({
              initials: getInitials(brand.name),
              hue: index % 3 === 0 ? 'teal' : index % 3 === 1 ? 'ember' : 'cream',
              name: brand.name,
              reason: `from ${formatCompactInr(brand.gmv_prev_mtd)} → ${formatCompactInr(brand.gmv_mtd)} ${lowerLabel}`,
              trailing: brand.growth_pct > 0 ? `↑ +${brand.growth_pct}%` : brand.growth_pct < 0 ? `↓ ${Math.abs(brand.growth_pct)}%` : '· flat',
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} brands`}
        searchPlaceholder="Search brand or category…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
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

      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={7} tableMinWidth={1400} />
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
          { label: `GMV · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 180, className: 'px-5' },
          { label: 'Growth', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
          { label: 'Share of portfolio', align: 'right', minWidth: 160, maxWidth: 200, className: 'px-5' },
          { label: 'Active buyers', align: 'right', minWidth: 150, maxWidth: 190, className: 'px-5' },
          { label: 'Campaign', minWidth: 220, maxWidth: 280, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1400}
      >
        {visibleRows.map((brand) => (
          <tr
            key={brand.id}
            className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
            onClick={() => router.push(`/brands/${brand.id}`)}
          >
            <td className="px-5 py-3.5 text-base text-cream-900">
              <div className="ent flex items-center gap-3">
                <EntityAvatar initials={brand.initials} hue={brand.hue} imageUrl={brand.logoUrl} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-cream-900">{brand.name}</p>
                  <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.04em] text-cream-700">{brand.skus} SKUs</p>
                </div>
              </div>
            </td>
            <td className="px-5 py-3.5 text-right text-base text-cream-900">
              <span className="font-display text-md font-medium text-cream-900 tabular-nums">{formatCompactInr(brand.gmv)}</span>
            </td>
            <td className="px-5 py-3.5 text-right text-base text-cream-900">
              <GrowthPill value={brand.growth} />
            </td>
            <td className="px-5 py-3.5 text-right text-base text-cream-900">
              <div className="mb-1 h-[5px] w-[184px] overflow-hidden rounded-full bg-cream-200">
                <div
                  className={`h-[5px] rounded-full ${brand.hue === 'ember' ? 'bg-ember-400' : brand.hue === 'cream' ? 'bg-cream-600' : 'bg-teal-500'}`}
                  style={{ width: `${Math.max(0, Math.min(100, brand.share))}%` }}
                />
              </div>
              <p className="font-mono text-xs text-cream-700">{brand.share}% of {formatCompactInr(portfolioGmv)}</p>
            </td>
            <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900 tabular-nums">
              {brand.activeBuyers}<span className="text-cream-600"> / {brand.totalBuyers}</span>
            </td>
            <td className="px-5 py-3.5 text-base text-cream-900">
              <p className="truncate text-sm text-cream-900">{brand.catalogName ?? 'No published campaign'}</p>
            </td>
            <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
          </tr>
        ))}
      </LandingTable>
      )}

      {hasMore ? (
        <div ref={sentinelRef} className="h-10 w-full" aria-hidden="true" />
      ) : null}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AddBrandCommand open={addBrandOpen} onOpenChange={setAddBrandOpen} hideTrigger />
        </>
      )}
    </PageWrap>
  );
}

export function BrandsLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantBrandsResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <BrandLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
