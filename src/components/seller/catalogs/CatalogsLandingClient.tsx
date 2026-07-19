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
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useTenantCatalogs, type CatalogsLandingResponse } from '@/hooks/useCatalogs';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { CatalogsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingPageLoadMore } from '@/components/seller/layout/LandingPageLoadMore';

type SortOption = 'Recently published' | 'Demand value (high → low)' | 'Open to demand (high → low)';

const SORT_OPTIONS: SortOption[] = ['Recently published', 'Demand value (high → low)', 'Open to demand (high → low)'];
const STATUS_OPTIONS = ['Draft', 'Scheduled', 'Live', 'Live · Unpublished Changes', 'Expiring soon', 'Expired', 'Archived'] as const;

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

function CatalogsLandingContent({
  initialData,
  initialSearch,
}: {
  initialData: CatalogsLandingResponse | null;
  initialSearch?: string;
}) {
  const router = useRouter();
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-catalogs-landing',
    scopeKey: 'fixed-90d',
    version: 4,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
      },
      sortBy: 'Recently published' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { status: [] };
  const statusFilter = filters.status ?? [];
  const { data, isLoading, isFetching, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantCatalogs(
    period,
    { search, status: statusFilter },
    initialData,
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-catalogs-landing',
    scopeKey: 'fixed-90d',
    ready: !isLoading,
  });
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
  const primaryDemandKind = landingData?.primary_demand_kind ?? 'orders';
  const primaryDemandNoun = primaryDemandKind === 'estimates' ? 'enquiries' : 'orders';

  // Action lists derived client-side from the already-fetched campaign rows (no new SQL).
  // Mirrors the 3 doc-starred Action options — each needs per-campaign views/view_pct/
  // conversion_pct/days_left, which the landing "today's read" callouts don't carry.
  const weakOpenCampaigns = useMemo(() => {
    const MIN_AGE_DAYS = 3;
    const now = Date.now();
    return [...catalogs]
      .filter((c) => c.status.label === 'Live' && (c.audience_count ?? 0) > 0
        && (now - new Date(c.created_at).getTime()) / 86_400_000 >= MIN_AGE_DAYS)
      .sort((a, b) => a.view_pct - b.view_pct)
      .slice(0, 3);
  }, [catalogs]);

  const openedNoDemandCampaigns = useMemo(
    () => [...catalogs]
      .filter((c) => c.views > 0 && c.conversions === 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 3),
    [catalogs],
  );

  const expiringEngagedCampaigns = useMemo(() => {
    const MAX_DAYS_LEFT = 14;
    return [...catalogs]
      .filter((c) => c.status.label === 'Live' && c.days_left != null && c.days_left <= MAX_DAYS_LEFT
        && c.views > 0 && c.conversions === 0)
      .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))
      .slice(0, 3);
  }, [catalogs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const interimRows = catalogs.filter((catalog) => {
        if (statusFilter.length === 0 || statusFilter.includes('All')) return true;
        return statusFilter.some((value) => {
          if (value === 'Draft') return catalog.status.label === 'Draft';
          if (value === 'Scheduled') return catalog.status.label === 'Scheduled';
          if (value === 'Live') return catalog.status.label === 'Live';
          if (value === 'Live · Unpublished Changes') return catalog.status.label === 'Live · Unpublished Changes';
          if (value === 'Expiring soon') return catalog.days_left != null && catalog.days_left <= 7 && catalog.days_left > 0;
          if (value === 'Expired') return catalog.status.label === 'Expired';
          if (value === 'Archived') return catalog.status.label === 'Archived';
          return false;
        });
      }).filter((catalog) => !query || catalog.name.toLowerCase().includes(query));
    return interimRows
      .sort((a, b) => {
        if (sortBy === 'Recently published') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === 'Demand value (high → low)') return b.gmv - a.gmv;
        return b.conversion_pct - a.conversion_pct;
      });
  }, [catalogs, search, sortBy, statusFilter]);

  if (isLoading && !landingData) return <CatalogsLandingSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load campaigns"
        description="There was a problem fetching campaign funnel metrics. Please try again."
      />
    );
  }
  if (!landingData) return <CatalogsLandingSkeleton />;
  const showRefreshingState = isLoading && !data;
  const estimatesEnabled = landingData.channels?.estimates_enabled ?? true;

  const tableColumns = [
    { label: 'Campaign', width: 280, minWidth: 260, className: 'px-5' },
    { label: 'Target Customers', width: 140, minWidth: 140, className: 'px-5' },
    { label: `Orders · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 100, className: 'px-5' },
    ...(estimatesEnabled
      ? [{ label: `Enquiries · ${metricSuffix}`, align: 'right' as const, width: 160, minWidth: 100, className: 'px-5' }]
      : []),
    { label: `Demand value · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 100, className: 'px-5' },
    { label: 'Customers opened', align: 'right' as const, width: 150, minWidth: 150, className: 'px-5' },
    { label: 'Customers with demand', align: 'right' as const, width: 170, minWidth: 150, className: 'px-5' },
    { label: 'Status', minWidth: 180, className: 'px-5' },
    { width: 20, className: 'px-4' },
  ];

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Growth"
        title="Campaigns"
        subtitle={`${landingData.total ?? catalogs.length} campaigns · ${landingData.kpis.live_catalogs} live · ${landingData.kpis.scheduled_catalogs ?? 0} scheduled.`}
        horizon={horizonLabel}
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
            label: 'Customers who opened campaigns',
            value: '—',
            sub: 'Needs backend — unique openers are not aggregated tenant-wide yet',
          },
          {
            label: 'Customers with campaign-linked demand',
            value: '—',
            sub: 'Needs backend — unique demand customers are not aggregated tenant-wide yet',
          },
          {
            label: `Campaign-linked demand value · ${metricSuffix}`,
            value: formatCompactInr(landingData.kpis.gmv_mtd),
            sub: `${landingData.kpis.conversions_mtd ?? landingData.kpis.orders_attributed_mtd} linked ${primaryDemandNoun}`,
            tone: 'accent',
          },
          {
            label: primaryDemandKind === 'estimates' ? 'Open-to-enquiry rate' : 'Open-to-order rate',
            value: `${landingData.kpis.avg_conversion_pct}%`,
            sub: 'average across live campaigns',
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            id: 'weak_opens',
            kind: 'risk',
            eyebrow: 'Live campaigns with weak opens',
            hint: `${weakOpenCampaigns.length}`,
            rows: weakOpenCampaigns.map((catalog) => ({
              id: catalog.id,
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: `${catalog.views} of ${catalog.audience_count ?? 0} customers opened`,
              trailing: <StatusTag label={`${catalog.view_pct}% opened`} tone="warning" />,
            })),
            getHref: (row) => `/campaigns/${row.id}`,
          },
          {
            id: 'many_openers_no_demand',
            kind: 'info',
            eyebrow: 'Many openers, no primary demand',
            hint: `${openedNoDemandCampaigns.length}`,
            rows: openedNoDemandCampaigns.map((catalog) => ({
              id: catalog.id,
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: `${catalog.views} opened · ${catalog.view_pct}% open rate · 0 ${primaryDemandNoun}`,
              trailing: formatCompactInr(catalog.gmv),
            })),
            getHref: (row) => `/campaigns/${row.id}`,
          },
          {
            id: 'expiring_engaged_non_buyers',
            kind: 'opportunity',
            eyebrow: 'Expiring with engaged non-buyers',
            hint: `${expiringEngagedCampaigns.length}`,
            rows: expiringEngagedCampaigns.map((catalog) => ({
              id: catalog.id,
              initials: catalog.initials,
              hue: catalog.hue,
              name: catalog.name,
              reason: `${catalog.view_pct}% open rate · expires ${catalog.valid_until_label}`,
              trailing: <StatusTag label={`${catalog.days_left}d left`} tone="warning" />,
            })),
            getHref: (row) => `/campaigns/${row.id}`,
          },
        ]}
      />

      <FilterBar
        count={`${filtered.length} campaigns`}
        searchPlaceholder="Search campaign…"
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
                      : catalog.status.label === 'Scheduled'
                        ? `Starts ${catalog.valid_from ? new Date(catalog.valid_from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'soon'}`
                        : catalog.status.label === 'Live · Unpublished Changes'
                          ? 'Live campaign has unpublished changes'
                          : catalog.status.label === 'Expired' || catalog.status.label === 'Archived'
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
      <LandingPageLoadMore hasMore={Boolean(hasNextPage)} loading={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />
        </>
      )}
    </PageWrap>
  );
}

export function CatalogsLandingClient({
  initialData,
  initialPeriod: _initialPeriod,
  initialSearch,
}: {
  initialData: CatalogsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="CATALOG_PUBLISHING">
      <CatalogsLandingContent initialData={initialData} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
