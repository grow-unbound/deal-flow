'use client';

import { useMemo, useState } from 'react';
import { Grid } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  FilterBar,
  GrowthPill,
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useCohortsLanding, type CohortType, type CohortsLandingResponse, type CohortsLandingRow } from '@/hooks/useCohorts';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Growth (high → low)' | 'Conversion (high → low)';

const CHIPS: Array<'All' | CohortType> = ['All', 'Geo-based', 'Tier-based', 'Brand affinity'];
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Growth (high → low)', 'Conversion (high → low)'];

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
}: {
  initialData: CohortsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError, refetch } = useCohortsLanding(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-cohorts-landing',
    scopeKey: period,
    initialState: {
      search: '',
      activeChip: 'All' as 'All' | CohortType,
      sortBy: 'GMV (high → low)' as SortOption,
    },
  });
  useRouteScrollRestoration({
    storageKey: 'seller-cohorts-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const search = routeState.search;
  const activeChip = routeState.activeChip;
  const sortBy = routeState.sortBy;

  const filtered = useMemo(() => {
    const rows = landingData?.cohorts ?? [];
    const query = search.trim().toLowerCase();

    return rows
      .filter((row) => (activeChip === 'All' ? true : row.type === activeChip))
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
        if (sortBy === 'Growth (high → low)') return b.growth_pct - a.growth_pct;
        return b.conversion_pct - a.conversion_pct;
      });
  }, [activeChip, landingData?.cohorts, search, sortBy]);

  if (isLoading && !landingData) return <CohortsLandingSkeleton />;

  if (isError && !landingData) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load cohorts"
          description="There was a problem fetching your cohorts. Please try again."
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
        title="Cohorts"
        subtitle={`${kpis?.total_cohorts ?? 0} buyer groups defined by geo, tier, and brand affinity. Each one gets its own catalogs and price list.`}
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Add a cohort"
        onPrimaryClick={() => router.push('/cohorts/new')}
      />

      {showRefreshingState ? (
        <CohortsDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load cohorts"
          description="There was a problem fetching your cohorts. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
      <InsightStrip4
        tiles={[
          {
            label: 'Cohorts',
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
            sub: 'catalog → order',
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
              reason: `${row.live_catalogs_count} catalogs live · ${row.active_members} active`,
              trailing: <GrowthPill value={row.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} cohorts`}
        searchPlaceholder="Search cohort or rule…"
        chips={CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        onChipChange={(chip) => setRouteState((current) => ({ ...current, activeChip: chip as 'All' | CohortType }))}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />

      <div className="v2-body overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="v2-grid-body grid grid-cols-1 gap-[14px] bg-cream-50 p-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cohort) => (
            <CohortTile key={cohort.id} cohort={cohort} metricSuffix={metricSuffix} onClick={() => router.push(`/cohorts/${cohort.id}`)} />
          ))}
        </div>
      </div>
        </>
      )}
    </PageWrap>
  );
}

function CohortTile({
  cohort,
  metricSuffix,
  onClick,
}: {
  cohort: CohortsLandingRow;
  metricSuffix: string;
  onClick: () => void;
}) {
  return (
    <article
      className="v2-coh-tile flex cursor-pointer flex-col gap-3 rounded-[14px] border border-cream-300 bg-white px-5 py-[18px] transition-all duration-fast hover:-translate-y-[1px] hover:border-cream-500"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[18px] font-medium leading-[1.2] tracking-[-0.005em] text-cream-900">{cohort.name}</h3>
        <StatusTag tone={cohort.status_tone} label={cohort.status_label} />
      </div>

      <p className="-mt-0.5 text-[12px] leading-[1.5] text-cream-700">{cohort.description ?? `${cohort.type} cohort`}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-cream-500">FOCUS:</span>
        {cohort.focus_chips.map((chip) => (
          <span key={chip} className="rounded-[4px] border border-cream-300 bg-cream-100 px-1.5 py-0.5 font-mono text-[10px] text-cream-800">
            {chip}
          </span>
        ))}
      </div>

      <div className="v2-coh-stats mt-1 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-cream-300 pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-700">{`GMV · ${metricSuffix}`}</p>
          <p className="mt-0.5 font-display text-[18px] font-medium tracking-[-0.005em] text-cream-900">{formatCompactInr(cohort.gmv_mtd)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-700">Growth</p>
          <p className={`mt-0.5 font-display text-[18px] font-medium tracking-[-0.005em] ${cohort.growth_pct >= 10 ? 'text-success-500' : 'text-cream-900'}`}>
            {cohort.growth_pct >= 0 ? '+' : ''}
            {cohort.growth_pct}%
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-700">Members</p>
          <p className="mt-0.5 font-display text-[18px] font-medium tracking-[-0.005em] text-cream-900">
            {cohort.active_members}
            <span className="text-[13px] text-cream-600"> / {cohort.total_members}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-700">Conversion</p>
          <p className="mt-0.5 font-display text-[18px] font-medium tracking-[-0.005em] text-cream-900">{cohort.conversion_pct.toFixed(1)}%</p>
        </div>
      </div>
    </article>
  );
}

export function CohortsLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: CohortsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="COHORTS">
      <CohortsLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
