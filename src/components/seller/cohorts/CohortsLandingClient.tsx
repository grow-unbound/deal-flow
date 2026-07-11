'use client';

import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { FeatureGate } from '@/components/FeatureGate';
import {
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
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useCohortsLanding, type CohortsLandingResponse } from '@/hooks/useCohorts';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)';

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getHue(index: number): 'teal' | 'ember' | 'cream' {
  return (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream';
}

function CohortsLandingSkeleton() {
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
        <div className="mt-2 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] rounded-[14px]" />
          ))}
        </div>
      </div>
    </PageWrap>
  );
}

function CohortsDataSkeleton() {
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
      <div className="mt-2 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[220px] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}

function CohortsLandingContent({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: CohortsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-cohorts-landing',
    scopeKey: period,
    version: 3,
    initialState: {
      search: '',
      filters: {
        brands: [] as string[],
      },
      sortBy: 'GMV (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { brands: [] };
  const { data, isLoading, isError, refetch } = useCohortsLanding(period, { search, brands: filters.brands }, initialData);
  useRouteScrollRestoration({
    storageKey: 'seller-cohorts-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const brandOptions = useMemo(
    () => (landingData?.brands ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
    [landingData?.brands],
  );
  const brandNameById = useMemo(
    () => new Map((landingData?.brands ?? []).map((brand) => [brand.id, brand.name])),
    [landingData?.brands],
  );
  const groups: FilterBarGroup[] = [
    {
      key: 'brands',
      label: 'Brands',
      options: brandOptions,
      values: filters.brands ?? [],
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filters: { ...(current.filters ?? filters), brands: values },
        })),
    },
  ];

  const filtered = useMemo(() => {
    const rows = landingData?.cohorts ?? [];
    const query = search.trim().toLowerCase();
    const brandFilter = filters.brands ?? [];

    return rows
      .filter((row) =>
        brandFilter.length === 0 ||
        row.allowed_tenant_brand_ids?.some((brandId) => brandFilter.includes(brandId))
      )
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          (row.description ?? '').toLowerCase().includes(query) ||
          row.focus_chips.some((chip) => chip.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'GMV (high → low)') return b.gmv_mtd - a.gmv_mtd;
        if (sortBy === 'GMV (low → high)') return a.gmv_mtd - b.gmv_mtd;
        return b.growth_pct - a.growth_pct;
      });
  }, [filters.brands, landingData?.cohorts, search, sortBy]);

  const formatAllowedBrands = (cohort: { allowed_tenant_brand_ids?: string[] | null }) => {
    const ids = cohort.allowed_tenant_brand_ids ?? [];
    if (ids.length === 0) return 'All brands';
    const names = ids.map((id) => brandNameById.get(id) ?? id).filter(Boolean);
    if (names.length === 0) return 'All brands';
    const visible = names.slice(0, 3);
    return names.length > 3 ? `${visible.join(', ')} + ${names.length - 3} more` : visible.join(', ');
  };

  if (isLoading && !landingData) return <CohortsLandingSkeleton />;

  if (isError && !landingData) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load customer groups"
          description="There was a problem fetching your customer groups. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }
  if (!landingData) return <CohortsLandingSkeleton />;
  const showRefreshingState = isLoading && !data;

  const kpis = landingData.kpis;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Segmentation"
        title="Customer Groups"
        subtitle={`${kpis?.total_cohorts ?? 0} buyer groups defined by geo, tier, and brand affinity. Each one gets its own campaigns and price list.`}
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Add a customer group"
        onPrimaryClick={() => router.push('/customer-groups/new')}
      />

      {showRefreshingState ? (
        <CohortsDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load customer groups"
          description="There was a problem fetching your customer groups. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
      <InsightStrip4
        tiles={[
          {
            label: 'Customer Groups',
            value: `${kpis?.total_cohorts ?? 0}`,
            sub: `covering ${kpis?.covered_members ?? 0} of ${kpis?.total_buyers ?? 0} buyers`,
          },
          {
            label: `Combined GMV · ${metricSuffix}`,
            value: formatCompactInr(kpis?.combined_gmv_mtd ?? 0),
            sub: `${(kpis?.growth_pct ?? 0) >= 0 ? '↑ +' : '↓ '}${Math.abs(kpis?.growth_pct ?? 0)}% vs last ${period}`,
            tone: 'accent',
          },
          {
            label: 'Avg conversion',
            value: `${(kpis?.avg_conversion_pct ?? 0).toFixed(1)}%`,
            sub: 'campaign → order',
          },
          {
            label: 'Uncategorised',
            value: `${kpis?.uncategorised_buyers ?? 0} buyers`,
            sub: 'not in any cohort',
            tone: 'warn',
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Low conversion',
            hint: `${landingData.todays_read.low_conversion.length}`,
            rows: landingData.todays_read.low_conversion.map((row, index) => ({
              initials: getInitials(row.name),
              hue: getHue(index),
              name: row.name,
              reason: `${row.conversion_pct.toFixed(1)}% conversion · ${row.active_members} of ${row.total_members} active`,
              trailing: `${row.conversion_pct.toFixed(1)}%`,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top performers',
            hint: 'by GMV',
            rows: landingData.todays_read.top_performers.map((row, index) => ({
              initials: getInitials(row.name),
              hue: getHue(index),
              name: row.name,
              reason: `${row.total_members} buyers · AOV ${formatCompactInr(row.aov)}`,
              trailing: formatCompactInr(row.gmv_mtd),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: landingData.todays_read.top_risers.map((row, index) => ({
              initials: getInitials(row.name),
              hue: getHue(index),
              name: row.name,
              reason: `${row.live_catalogs_count} campaigns live · ${row.active_members} active`,
              trailing: <GrowthPill value={row.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} customer groups`}
        searchPlaceholder="Search customer group or rule…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={groups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} strokeWidth={1.5} />}
          heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching customer groups' : 'No customer groups yet'}
          description={
            search.trim() || groups.some((group) => group.values.length > 0)
              ? 'Try a different search or type filter.'
              : 'Create a customer group to segment buyers for campaigns and pricing.'
          }
          action={
            <Button variant="accent" asChild>
              <Link href="/customer-groups/new" className="inline-flex items-center gap-1.5">
                <Plus size={13} />
                Add a customer group
              </Link>
            </Button>
          }
        />
      ) : (
        <LandingTable
          columns={[
            { label: 'Customer group', minWidth: 280, maxWidth: 360, className: 'px-5' },
            { label: 'Type', minWidth: 160, maxWidth: 180, className: 'px-5' },
            { label: 'Allowed brands', minWidth: 220, maxWidth: 340, className: 'px-5' },
            { label: 'Members', align: 'right', minWidth: 140, maxWidth: 180, className: 'px-5' },
            { label: `GMV · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
            { label: 'Growth', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
            { label: 'Status', minWidth: 140, maxWidth: 180, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1260}
        >
          {filtered.map((cohort) => (
            <tr
              key={cohort.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/customer-groups/${cohort.id}`)}
            >
              <td className="px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-cream-900">{cohort.name}</p>
                  <p className="mt-0.5 truncate text-xs text-cream-600">{cohort.description ?? '—'}</p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-cream-800">{cohort.is_static ? 'Manual selection' : 'Rule based'}</td>
              <td className="px-5 py-3.5 text-sm text-cream-800">{formatAllowedBrands(cohort)}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {cohort.active_members}/{cohort.total_members}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {formatCompactInr(cohort.gmv_mtd)}
              </td>
              <td className="px-5 py-3.5 text-right">
                <GrowthPill value={cohort.growth_pct} />
              </td>
              <td className="px-5 py-3.5">
                <div className="space-y-1">
                  <StatusTag tone={cohort.status_tone} label={cohort.status_label} />
                </div>
              </td>
              <td className="px-4 py-3.5 text-right text-cream-500">›</td>
            </tr>
          ))}
        </LandingTable>
      )}
        </>
      )}
    </PageWrap>
  );
}

export function CohortsLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: CohortsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="COHORTS">
      <CohortsLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
