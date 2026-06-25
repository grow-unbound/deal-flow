'use client';

import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { FeatureGate } from '@/components/FeatureGate';
import {
  FilterBar,
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
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useCohortsLanding, type CohortType, type CohortsLandingResponse } from '@/hooks/useCohorts';
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} strokeWidth={1.5} />}
          heading={search.trim() || activeChip !== 'All' ? 'No matching customer groups' : 'No customer groups yet'}
          description={
            search.trim() || activeChip !== 'All'
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
            { label: 'Customer group', minWidth: 280, className: 'px-5' },
            { label: 'Type', minWidth: 140, className: 'px-5' },
            { label: 'Members', align: 'right', minWidth: 140, className: 'px-5' },
            { label: `GMV · ${metricSuffix}`, align: 'right', minWidth: 140, className: 'px-5' },
            { label: 'Growth', align: 'right', minWidth: 120, className: 'px-5' },
            { label: 'Conversion', align: 'right', minWidth: 120, className: 'px-5' },
            { label: 'Status', minWidth: 160, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableClassName="min-w-[1160px]"
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
                  <p className="mt-0.5 truncate text-xs text-cream-600">
                    {cohort.description ?? `${cohort.type} cohort`}
                  </p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-cream-800">{cohort.type}</td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {cohort.active_members} / <span className="text-cream-600">{cohort.total_members}</span>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {formatCompactInr(cohort.gmv_mtd)}
              </td>
              <td className="px-5 py-3.5 text-right">
                <GrowthPill value={cohort.growth_pct} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {cohort.conversion_pct.toFixed(1)}%
              </td>
              <td className="px-5 py-3.5">
                <div className="space-y-1">
                  <StatusTag tone={cohort.status_tone} label={cohort.status_label} />
                  <div className="flex flex-wrap gap-1.5">
                    {cohort.focus_chips.slice(0, 3).map((chip) => (
                      <span
                        key={chip}
                        className="rounded-[4px] border border-cream-300 bg-cream-100 px-1.5 py-0.5 text-xs uppercase tracking-[0.04em] text-cream-700"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
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
