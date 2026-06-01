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
import { useCohortsLanding, type CohortType, type CohortsLandingResponse, type CohortsLandingRow } from '@/hooks/useCohorts';
import { formatCompactInr } from '@/lib/utils';

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

function CohortsLandingContent({ initialData }: { initialData: CohortsLandingResponse | null }) {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useCohortsLanding(initialData);

  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<'All' | CohortType>('All');
  const [sortBy, setSortBy] = useState<SortOption>('GMV (high → low)');

  const filtered = useMemo(() => {
    const rows = data?.cohorts ?? [];
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
  }, [activeChip, data?.cohorts, search, sortBy]);

  if (isLoading) return <CohortsLandingSkeleton />;

  if (isError) {
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

  const kpis = data?.kpis;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Segmentation"
        title="Cohorts"
        subtitle={`${kpis?.total_cohorts ?? 0} buyer groups defined by geo, tier, and brand affinity. Each one gets its own catalogs and price list.`}
        horizon="This month"
        secondary={{
          label: 'Publish catalog',
          icon: <Grid size={13} />,
          onClick: () => router.push('/catalogs'),
        }}
        primary="New cohort"
        onPrimaryClick={() => router.push('/cohorts/new')}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Cohorts',
            value: `${kpis?.total_cohorts ?? 0}`,
            sub: `covering ${kpis?.covered_members ?? 0} of ${kpis?.total_buyers ?? 0} buyers`,
          },
          {
            label: 'Combined GMV',
            value: formatCompactInr(kpis?.combined_gmv_mtd ?? 0),
            sub: `${(kpis?.growth_pct ?? 0) >= 0 ? '↑ +' : '↓ '}${Math.abs(kpis?.growth_pct ?? 0)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Avg conversion',
            value: `${(kpis?.avg_conversion_pct ?? 0).toFixed(1)}%`,
            sub: 'catalog → order',
          },
          {
            label: 'Uncategorised',
            value: `${kpis?.uncategorised_buyers ?? 0}`,
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
            hint: `${data?.todays_read.low_conversion.length ?? 0}`,
            rows: (data?.todays_read.low_conversion ?? []).map((row, index) => ({
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
            rows: (data?.todays_read.top_performers ?? []).map((row, index) => ({
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
            rows: (data?.todays_read.top_risers ?? []).map((row, index) => ({
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
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip as 'All' | CohortType)}
        sortOptions={[...SORT_OPTIONS]}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      <div className="v2-body overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="v2-grid-body grid grid-cols-1 gap-[14px] bg-cream-50 p-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cohort) => (
            <CohortTile key={cohort.id} cohort={cohort} onClick={() => router.push(`/cohorts/${cohort.id}`)} />
          ))}
        </div>
      </div>
    </PageWrap>
  );
}

function CohortTile({ cohort, onClick }: { cohort: CohortsLandingRow; onClick: () => void }) {
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-700">GMV · MTD</p>
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

export function CohortsLandingClient({ initialData }: { initialData: CohortsLandingResponse | null }) {
  return (
    <FeatureGate flag="COHORTS">
      <CohortsLandingContent initialData={initialData} />
    </FeatureGate>
  );
}
