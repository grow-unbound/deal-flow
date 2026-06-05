'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
  FilterBar,
  GrowthPill,
} from '@/components/seller/layout';
import { ErrorState } from '@/components/ui/empty-state';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useTenantCatalogs, type CatalogLandingRow, type CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'Recently published' | 'GMV (high → low)' | 'Conversion (high → low)';
type FilterChip = 'All' | 'Live' | 'Draft' | 'Ended';

const SORT_OPTIONS: SortOption[] = ['Recently published', 'GMV (high → low)', 'Conversion (high → low)'];
const FILTER_CHIPS: FilterChip[] = ['All', 'Live', 'Draft', 'Ended'];

function CatalogsLoadingSkeleton() {
  return (
    <PageWrap>
      <div className="h-24 animate-pulse rounded-[12px] bg-cream-100" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-2 grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[260px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </PageWrap>
  );
}

function CatalogRowReason(catalog: CatalogLandingRow) {
  if (catalog.status.label === 'Draft') return 'Draft · not yet shipped to cohort';
  if (catalog.status.label === 'Ended') return `Ended ${catalog.valid_until_label} · ${catalog.orders} orders`;
  if (catalog.days_left != null && catalog.days_left <= 5 && catalog.days_left > 0) {
    return `Expires in ${catalog.days_left}d · ${catalog.orders} orders`;
  }
  return `${catalog.cohort_name} · ${catalog.orders} orders`;
}

function CatalogsLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: CatalogsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, lowerLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useTenantCatalogs(period, initialData);

  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<FilterChip>('All');
  const [sortBy, setSortBy] = useState<SortOption>('Recently published');

  const catalogs = data?.catalogs ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalogs
      .filter((catalog) => (activeChip === 'All' ? true : catalog.status.label === activeChip))
      .filter((catalog) => !query || catalog.name.toLowerCase().includes(query) || catalog.cohort_name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortBy === 'Recently published') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
        return b.conversion_pct - a.conversion_pct;
      });
  }, [activeChip, catalogs, search, sortBy]);

  if (isLoading) return <CatalogsLoadingSkeleton />;

  if (isError || !data) {
    return (
      <ErrorState
        heading="Couldn't load catalogs"
        description="There was a problem fetching catalog funnel metrics. Please try again."
      />
    );
  }

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Distribution"
        title="Catalogs"
        subtitle="The mailers your retailers see in the buyer app. Each one targets a cohort, runs for a validity window, and rolls up to one funnel."
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Add a catalog"
        onPrimaryClick={() => router.push('/catalogs/new')}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Live catalogs',
            value: `${data.kpis.live_catalogs}`,
            sub: `${data.kpis.draft_catalogs} in draft, ${data.kpis.ended_catalogs} ended`,
          },
          {
            label: `GMV · ${metricSuffix}`,
            value: formatCompactInr(data.kpis.gmv_mtd),
            sub: `${data.kpis.gmv_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(data.kpis.gmv_growth_pct)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Avg conversion',
            value: `${data.kpis.avg_conversion_pct}%`,
            sub: 'opens → orders',
          },
          {
            label: 'Orders attributed',
            value: `${data.kpis.orders_attributed_mtd}`,
            sub: lowerLabel,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs attention',
            hint: `${data.todays_read.needs_attention.length}`,
            rows: data.todays_read.needs_attention.map((catalog) => ({
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: CatalogRowReason(catalog),
              trailing: <StatusTag label={catalog.status.label} tone={catalog.status.tone} />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top performers',
            hint: 'by GMV',
            rows: data.todays_read.top_performers.map((catalog) => ({
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: `${catalog.cohort_name} · ${catalog.orders} orders · ${catalog.conversion_pct}% conv.`,
              trailing: formatCompactInr(catalog.gmv),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: data.todays_read.top_risers.map((catalog) => ({
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: `${catalog.cohort_name} · ${catalog.days_left != null ? `expires in ${catalog.days_left}d` : 'rolling validity'}`,
              trailing: <GrowthPill value={catalog.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} catalogs`}
        searchPlaceholder="Search catalog or cohort…"
        chips={FILTER_CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip as FilterChip)}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      <div className="mt-2 grid grid-cols-2 gap-4">
        {filtered.map((catalog) => {
          const badgeClass =
            catalog.status.label === 'Draft'
              ? 'bg-amber-100 text-amber-700'
              : catalog.status.label === 'Ended'
                ? 'bg-cream-200 text-cream-700'
                : 'bg-white/20 text-cream-50';

          return (
            <article
              key={catalog.id}
              className="cursor-pointer overflow-hidden rounded-[14px] border border-cream-200 bg-cream-50 transition-colors hover:border-teal-300"
              onClick={() => router.push(`/catalogs/${catalog.id}`)}
            >
              <div
                className={`relative flex h-[110px] items-end justify-between overflow-hidden px-4 pb-[14px] ${
                  catalog.hue === 'teal'
                    ? 'bg-[linear-gradient(135deg,#346A5C_0%,#1F3A34_60%,#142823_100%)]'
                    : catalog.hue === 'ember'
                      ? 'bg-[linear-gradient(135deg,#DC9655_0%,#C26E3A_60%,#874720_100%)]'
                      : 'bg-[linear-gradient(135deg,#C9BFAC_0%,#A89E89_60%,#6B6760_100%)]'
                }`}
              >
                <div>
                  <h3 className="font-display text-[15px] font-semibold leading-[1.15] text-white">{catalog.name}</h3>
                  <p className="mt-1 text-[11px] text-white/70">{catalog.products_count} products · {catalog.brands_count} brands</p>
                </div>
                <span className={`absolute right-3 top-3 rounded-full px-[9px] py-[3px] text-[10px] font-semibold tracking-[0.04em] ${badgeClass}`}>
                  {catalog.status.label.toUpperCase()}
                </span>
              </div>

              <div className="space-y-[10px] p-4">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[11px] text-cream-500">Cohort</span>
                  <span className="font-medium text-cream-900">{catalog.cohort_name}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[11px] text-cream-500">GMV</span>
                  <span className="font-medium text-cream-900">{catalog.gmv > 0 ? formatCompactInr(catalog.gmv) : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[11px] text-cream-500">Orders</span>
                  <span className="font-medium text-cream-900">{catalog.orders > 0 ? `${catalog.orders} (${catalog.conversion_pct}%)` : '—'}</span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-cream-300 pt-2 text-[12.5px]">
                  <span className="text-[11px] text-cream-500">
                    {catalog.status.label === 'Draft' ? 'Validity' : catalog.status.label === 'Ended' ? 'Ended' : 'Days left'}
                  </span>
                  <span className="font-medium text-cream-900">
                    {catalog.status.label === 'Live' && catalog.days_left != null
                      ? `${catalog.days_left}d · until ${catalog.valid_until_label}`
                      : catalog.valid_until_label}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </PageWrap>
  );
}

export function CatalogsLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: CatalogsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="CATALOG_PUBLISHING">
      <CatalogsLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
