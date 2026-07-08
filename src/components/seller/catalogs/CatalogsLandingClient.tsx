'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Library } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
  FilterBar,
  type FilterBarGroup,
  GrowthPill,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useTenantCatalogs, type CatalogLandingRow, type CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'Recently published' | 'GMV (high → low)' | 'Conversion (high → low)';

const SORT_OPTIONS: SortOption[] = ['Recently published', 'GMV (high → low)', 'Conversion (high → low)'];
const STATUS_OPTIONS = ['Draft', 'Live', 'Expiring soon', 'Ended'] as const;

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

function CatalogsDataSkeleton() {
  return (
    <>
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
    </>
  );
}

function CatalogRowReason(catalog: CatalogLandingRow) {
  const conversionLabel = catalog.conversions > 0 ? `${catalog.conversions} conversions` : 'no conversions';
  if (catalog.status.label === 'Draft') return 'Draft · not yet sent to customer group';
  if (catalog.status.label === 'Ended') return `Ended ${catalog.valid_until_label} · ${conversionLabel}`;
  if (catalog.days_left != null && catalog.days_left <= 5 && catalog.days_left > 0) {
    return `Expires in ${catalog.days_left}d · ${conversionLabel}`;
  }
  return `${catalog.cohort_name} · ${conversionLabel}`;
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
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-catalogs-landing',
    scopeKey: period,
    version: 2,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
      },
      sortBy: 'Recently published' as SortOption,
    },
  });
  useRouteScrollRestoration({
    storageKey: 'seller-catalogs-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { status: [] };
  const statusFilter = filters.status ?? [];
  const groups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS.map((value) => ({ value, label: value })),
      values: statusFilter,
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filters: { ...(current.filters ?? filters), status: values },
        })),
    },
  ];

  const catalogs = landingData?.catalogs ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalogs
      .filter((catalog) => {
        if (statusFilter.length === 0 || statusFilter.includes('All')) return true;
        return statusFilter.some((value) => {
          if (value === 'Draft') return catalog.status.label === 'Draft';
          if (value === 'Live') return catalog.status.label === 'Live';
          if (value === 'Expiring soon') return catalog.days_left != null && catalog.days_left <= 7 && catalog.days_left > 0;
          if (value === 'Ended') return catalog.status.label === 'Ended';
          return false;
        });
      })
      .filter((catalog) => !query || catalog.name.toLowerCase().includes(query) || catalog.cohort_name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sortBy === 'Recently published') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === 'GMV (high → low)') return b.gmv - a.gmv;
        return b.conversion_pct - a.conversion_pct;
      });
  }, [catalogs, search, sortBy, statusFilter]);

  if (isLoading && !landingData) return <CatalogsLoadingSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load campaigns"
        description="There was a problem fetching campaign funnel metrics. Please try again."
      />
    );
  }
  if (!landingData) return <CatalogsLoadingSkeleton />;
  const showRefreshingState = isLoading && !data;
  const estimatesEnabled = landingData.channels?.estimates_enabled ?? true;

  const tableColumns = [
    { label: 'Campaign', width: 280, minWidth: 260, className: 'px-5' },
    { label: 'Target Buyers', width: 140, minWidth: 140, className: 'px-5' },
    { label: `Orders · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 100, className: 'px-5' },
    ...(estimatesEnabled
      ? [{ label: `Estimates · ${metricSuffix}`, align: 'right' as const, width: 160, minWidth: 100, className: 'px-5' }]
      : []),
    { label: `GMV · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 100, className: 'px-5' },
    { label: 'Buyers · Viewed', align: 'right' as const, width: 150, minWidth: 150, className: 'px-5' },
    { label: 'Buyers · Ordered', align: 'right' as const, width: 170, minWidth: 150, className: 'px-5' },
    { label: 'Status', minWidth: 180, className: 'px-5' },
    { width: 20, className: 'px-4' },
  ];

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Growth"
        title="Campaigns"
        subtitle="Targeted offers for your customer groups. Each campaign picks a product set, a price, and a group — then shares via WhatsApp."
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Add a campaign"
        onPrimaryClick={() => router.push('/campaigns/new')}
      />

      {showRefreshingState ? (
        <CatalogsDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load campaigns"
          description="There was a problem fetching campaign funnel metrics. Please try again."
        />
      ) : (
        <>
      <InsightStrip4
        tiles={[
          {
            label: 'Live campaigns',
            value: `${landingData.kpis.live_catalogs}`,
            sub: `${landingData.kpis.draft_catalogs} in draft · ${landingData.kpis.expiring7d} ending in 7 days`,
          },
          {
            label: `GMV · ${metricSuffix}`,
            value: formatCompactInr(landingData.kpis.gmv_mtd),
            sub: `${landingData.kpis.gmv_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(landingData.kpis.gmv_growth_pct)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Avg conversion',
            value: `${landingData.kpis.avg_conversion_pct}%`,
            sub: 'opens → conversions',
          },
          {
            label: 'Conversions attributed',
            value: `${landingData.kpis.conversions_mtd ?? landingData.kpis.orders_attributed_mtd}`,
            sub: lowerLabel,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs attention',
            hint: `${landingData.todays_read.needs_attention.length}`,
            rows: landingData.todays_read.needs_attention.map((catalog) => ({
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
            rows: landingData.todays_read.top_performers.map((catalog) => ({
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: `${catalog.cohort_name} · ${catalog.conversions} conversions · ${catalog.conversion_pct}% conv.`,
              trailing: formatCompactInr(catalog.gmv),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: landingData.todays_read.top_risers.map((catalog) => ({
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
        count={`${filtered.length} campaigns`}
        searchPlaceholder="Search campaign or customer group…"
        chips={[]}
        activeChip=""
        sortBy={sortBy}
        hideViewToggle
        groups={groups}
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Library size={28} strokeWidth={1.5} />}
          heading={search.trim() || statusFilter.length > 0 ? 'No matching campaigns' : 'No campaigns yet'}
          description={
            search.trim() || statusFilter.length > 0
              ? 'Try a different search or status filter.'
              : 'Publish a campaign to share products with a customer group.'
          }
          action={
            <Button variant="accent" asChild>
              <Link href="/campaigns/new" className="inline-flex items-center gap-1.5">
                <Plus size={13} />
                Add a campaign
              </Link>
            </Button>
          }
        />
      ) : (
        <LandingTable
          columns={tableColumns}
          tableClassName={estimatesEnabled ? 'min-w-[1400px]' : 'min-w-[1270px]'}
        >
          {filtered.map((catalog) => (
            <tr
              key={catalog.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/campaigns/${catalog.id}`)}
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <EntityAvatar initials={catalog.initials} hue={catalog.hue} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{catalog.name}</p>
                    <p className="mt-0.5 truncate text-xs uppercase tracking-[0.05em] text-cream-500">
                      {catalog.products_count} products · {catalog.brands_count} brands
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="space-y-1">
                  <p className="text-sm text-cream-800">{catalog.cohort_name}</p>
                  <p className="text-xs text-cream-600">
                    {catalog.audience_count != null ? `${catalog.audience_count} buyers` : '—'}
                  </p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {catalog.order_count > 0 ? catalog.order_count : '—'}
              </td>
              {estimatesEnabled ? (
                <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                  {catalog.estimate_count > 0 ? catalog.estimate_count : '—'}
                </td>
              ) : null}
              <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                {catalog.gmv > 0 ? formatCompactInr(catalog.gmv) : '—'}
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="space-y-1">
                  <p className="font-mono text-sm text-cream-900">
                    {catalog.views > 0 ? catalog.views : '—'}
                  </p>
                  <p className="text-xs text-cream-600">
                    {catalog.audience_count ? `${catalog.view_pct}% of buyers` : '—'}
                  </p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="space-y-1">
                  <p className="font-mono text-sm text-cream-900">
                    {(catalog.conversions ?? 0) > 0 ? catalog.conversions : '—'}
                  </p>
                  <p className="text-xs text-cream-600">{catalog.conversion_pct}% conversion</p>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="space-y-1">
                  <StatusTag label={catalog.status.label} tone={catalog.status.tone} />
                  <p className="text-xs text-cream-600">
                    {catalog.status.label === 'Draft'
                      ? 'Not yet sent'
                      : catalog.status.label === 'Ended'
                        ? catalog.valid_until_label
                        : catalog.days_left != null
                          ? `${catalog.days_left}d · until ${catalog.valid_until_label}`
                          : catalog.valid_until_label}
                  </p>
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
