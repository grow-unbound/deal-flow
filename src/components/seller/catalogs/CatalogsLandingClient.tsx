'use client';

import { Fragment, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { Plus, Library } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  StickyListHeader,
  FilterBar,
  type FilterBarGroup,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot, type SellerMobileListItem } from '@/components/seller/mobile';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import {
  useTenantCatalogs,
  useTenantCatalogsMetrics,
  type CatalogLandingRow,
  type CatalogsLandingKpiCardV4,
  type CatalogsLandingMetricsV4,
  type CatalogsLandingResponse,
} from '@/hooks/useCatalogs';
import { cn, formatNumberValue } from '@/lib/utils';
import { CAMPAIGNS_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import { joinSplitListMeta } from '@/lib/seller-split-list-ui';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { CatalogsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { CampaignFormSheet } from './CampaignFormSheet';

type SortOption = 'Recently published' | 'Demand value (high → low)' | 'Open to demand (high → low)';

const SORT_OPTIONS: SortOption[] = ['Recently published', 'Demand value (high → low)', 'Open to demand (high → low)'];
const STATUS_OPTIONS = ['Draft', 'Scheduled', 'Live', 'Live · Unpublished Changes', 'Expiring soon', 'Expired', 'Archived'] as const;
const CONVERSION_OPTIONS = [
  { value: 'has_viewed', label: 'Campaign viewed' },
  { value: 'has_demand', label: 'Demand generated' },
  { value: 'has_revenue', label: 'Revenue generated' },
] as const;

function formatMetricCard(card: CatalogsLandingKpiCardV4): string {
  const idLabel = card.id.toLowerCase();
  if (idLabel.includes('value') || idLabel.includes('sales') || idLabel.includes('revenue') || idLabel === 'campaign_demand') {
    return formatNumberValue(card.value ?? 0, 'CURRENCY_THRESHOLD');
  }
  if (idLabel.includes('rate') || idLabel.includes('pct') || idLabel.includes('share')) {
    return `${card.value ?? 0}%`;
  }
  return `${card.value ?? 0}`;
}

function campaignExpiryText(catalog: CatalogLandingRow): string | null {
  if (catalog.days_left == null) return null;
  return `Expires in ${catalog.days_left}d`;
}

function CatalogsLandingContent({
  initialData,
  initialMetrics,
  initialSearch,
}: {
  initialData: CatalogsLandingResponse | null;
  initialMetrics: CatalogsLandingMetricsV4 | null;
  initialSearch?: string;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/campaigns');
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-catalogs-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/campaigns',
    version: 4,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
        conversion: [] as string[],
      },
      filter_preset: null as Record<string, unknown> | null,
      sortBy: 'Recently published' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { status: [], conversion: [] };
  const statusFilter = filters.status ?? [];
  const conversionFilter = filters.conversion ?? [];
  const filterPreset = routeState.filter_preset ?? null;
  const metricsQuery = useTenantCatalogsMetrics(initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const { data, isLoading, isFetching, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantCatalogs(
    period,
    { search, status: statusFilter, conversion: conversionFilter, filter_preset: filterPreset },
    initialData,
  );
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  useRouteScrollRestoration({
    storageKey: 'seller-catalogs-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/campaigns',
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
          filter_preset: null,
          filters: { ...(current.filters ?? filters), status: values },
        })),
    },
    {
      key: 'conversion',
      label: 'Conversion',
      options: CONVERSION_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      values: conversionFilter,
      onChange: (values) =>
        setRouteState((current) => ({
          ...current,
          filter_preset: null,
          filters: { ...(current.filters ?? filters), conversion: values },
        })),
    },
  ];

  const catalogs = landingData?.catalogs ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const interimRows = catalogs.filter((catalog) => {
        if (statusFilter.length === 0 || statusFilter.includes('All')) return true;
        const statusMatches = statusFilter.some((value) => {
          if (value === 'Draft') return catalog.status.label === 'Draft';
          if (value === 'Scheduled') return catalog.status.label === 'Scheduled';
          if (value === 'Live') return catalog.status.label === 'Live';
          if (value === 'Live · Unpublished Changes') return catalog.status.label === 'Live · Unpublished Changes';
          if (value === 'Expiring soon') return catalog.days_left != null && catalog.days_left <= 7 && catalog.days_left > 0;
          if (value === 'Expired') return catalog.status.label === 'Expired';
          if (value === 'Archived') return catalog.status.label === 'Archived';
          return false;
        });
        if (!statusMatches) return false;
        if (conversionFilter.length === 0) return true;
        return conversionFilter.some((value) => {
          if (value === 'has_viewed') return catalog.views > 0;
          if (value === 'has_demand') return (catalog.demand_customers ?? 0) > 0 || catalog.order_count > 0 || catalog.estimate_count > 0;
          if (value === 'has_revenue') return (catalog.invoice_value ?? 0) > 0 || (catalog.invoice_count ?? 0) > 0;
          return false;
        });
      }).filter((catalog) => !query || catalog.name.toLowerCase().includes(query));
    return interimRows
      .sort((a, b) => {
        if (sortBy === 'Recently published') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === 'Demand value (high → low)') return b.gmv - a.gmv;
        return b.conversion_pct - a.conversion_pct;
      });
  }, [catalogs, conversionFilter, search, sortBy, statusFilter]);

  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(filtered.length, SELLER_INFINITE_SCROLL_RATIO),
    [filtered.length],
  );

  const showRefreshingState = metricsQuery.isLoading && !metricsData && isLoading && !landingData;
  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading campaigns" />
    ) : (
      <CatalogsLandingSkeleton />
    );
  }

  const estimatesEnabled = landingData?.channels?.estimates_enabled ?? true;
  const metricCards = metricsData?.cards ?? [];
  const selectedCard =
    metricCards.find((card) => filterPreset != null && JSON.stringify(filterPreset) === JSON.stringify(card.filter_preset ?? null)) ?? null;
  const headerCard = selectedCard ?? metricCards[0] ?? null;
  const filtersFromCampaignPreset = (preset?: Record<string, unknown>) => {
    if (!preset) return { status: [] as string[], conversion: [] as string[] };
    const status = typeof preset.status === 'string' ? [preset.status] : Array.isArray(preset.status) ? preset.status.map(String) : [];
    const conversion: string[] = [];
    if (preset.has_viewed === true || preset.conversion === 'has_viewed') conversion.push('has_viewed');
    if (preset.has_demand === true || preset.conversion === 'has_demand') conversion.push('has_demand');
    if (preset.has_revenue === true || preset.conversion === 'has_revenue') conversion.push('has_revenue');
    return { status, conversion };
  };

  const tableColumns = [
    { label: 'Campaign', width: 280, minWidth: 260, className: 'px-5' },
    { label: 'Target Customers', width: 140, minWidth: 140, className: 'px-5' },
    { label: `Orders · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 100, className: 'px-5' },
    ...(estimatesEnabled
      ? [{ label: `Enquiries · ${metricSuffix}`, align: 'right' as const, width: 160, minWidth: 100, className: 'px-5' }]
      : []),
    { label: `Demand value · ${metricSuffix}`, align: 'right' as const, width: 140, minWidth: 100, className: 'px-5' },
    { label: `Converted Sales · ${metricSuffix}`, align: 'right' as const, width: 160, minWidth: 130, className: 'px-5' },
    { label: 'Customers opened', align: 'right' as const, width: 150, minWidth: 150, className: 'px-5' },
    { label: 'Customers with demand', align: 'right' as const, width: 170, minWidth: 150, className: 'px-5' },
    { label: 'Status', minWidth: 180, className: 'px-5' },
    { width: 20, className: 'px-4' },
  ];

  const hasActiveFilters = Boolean(
    search.trim() || statusFilter.length > 0 || conversionFilter.length > 0 || filterPreset,
  );

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <SplitPaneStickyHeaderSlot
          isPaneOpen={isPaneOpen}
          showRefreshingState={showRefreshingState}
          isError={isError || metricsQuery.isError}
        >
          <PageHeader
            eyebrow="Growth"
            title={isPaneOpen && headerCard ? kpiLabel(CAMPAIGNS_KPI_COPY, headerCard) : 'Campaigns'}
            subtitle={
              isPaneOpen && headerCard
                ? `${formatMetricCard(headerCard)} · ${kpiSupportingText(CAMPAIGNS_KPI_COPY, headerCard)}`
                : `${landingData?.total ?? catalogs.length} campaigns · ${landingData?.kpis.live_catalogs ?? 0} live · ${landingData?.kpis.scheduled_catalogs ?? 0} scheduled.`
            }
            horizon={horizonLabel}
            showHorizonControl={!isPaneOpen}
            primary="Add a campaign"
            onPrimaryClick={() => setCampaignFormOpen(true)}
            compact={isPaneOpen}
          />

          {isPaneOpen ? null : (
            <InsightStrip4
              tiles={metricCards.slice(0, 4).map((card, index) => ({
                label: card.time_basis ? `${kpiLabel(CAMPAIGNS_KPI_COPY, card)} · ${card.time_basis}` : kpiLabel(CAMPAIGNS_KPI_COPY, card),
                value: formatMetricCard(card),
                sub: kpiSupportingText(CAMPAIGNS_KPI_COPY, card),
                tone: index === 2 ? 'accent' : undefined,
                selected: filterPreset != null && JSON.stringify(filterPreset) === JSON.stringify(card.filter_preset ?? null),
                onClick: () => {
                  const preset = card.filter_preset ?? null;
                  setRouteState((current) => ({
                    ...current,
                    filter_preset: preset,
                    filters: filtersFromCampaignPreset(preset ?? undefined),
                  }));
                },
              }))}
            />
          )}

          <FilterBar
            count={`${filtered.length} campaigns${(isFetching || isFetchingNextPage) ? ' · Updating' : ''}`}
            searchPlaceholder="Search campaign…"
            chips={[]}
            activeChip=""
            sortBy={sortBy}
            hideViewToggle
            compact={isPaneOpen}
            groups={groups}
            searchValue={search}
            onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value, filter_preset: null }))}
            sortOptions={SORT_OPTIONS}
            onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
          />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError || metricsQuery.isError ? (
          <ErrorState
            heading="Couldn't load campaigns"
            description="There was a problem fetching campaign funnel metrics. Please try again."
          />
        ) : (
          <>
            {(isLoading || isFetching) && filtered.length === 0 ? (
              isPaneOpen ? (
                <SplitPaneListRowsSkeleton isPaneOpen showLeading />
              ) : null
            ) : (
              <LandingTable
                showEmptyState={filtered.length === 0 && !isLoading}
                emptyState={
                  <EmptyState
                    icon={<Library size={28} strokeWidth={1.5} />}
                    heading={hasActiveFilters ? 'No matching campaigns' : 'No campaigns yet'}
                    description={
                      hasActiveFilters
                        ? 'Try a different search or status filter.'
                        : 'Publish a campaign to share products with a customer group.'
                    }
                    action={
                      <Button variant="accent" onClick={() => setCampaignFormOpen(true)} className="inline-flex items-center gap-1.5">
                        <Plus size={13} />
                        Add a campaign
                      </Button>
                    }
                  />
                }
                columns={tableColumns}
                tableClassName={estimatesEnabled ? 'min-w-[1400px]' : 'min-w-[1270px]'}
                forceCompact={isPaneOpen}
                sentinelIndex={sentinelIndex}
                sentinelRef={sentinelRef}
                mobileRows={filtered.map((catalog): SellerMobileListItem => ({
                  id: catalog.id,
                  href: `/campaigns/${catalog.id}`,
                  leading: (
                    <EntityAvatar
                      initials={catalog.initials}
                      hue={catalog.hue}
                      imageUrl={catalog.hero_image_url}
                      size={38}
                    />
                  ),
                  eyebrow: catalog.status.label,
                  primary: catalog.name,
                  supporting: joinSplitListMeta(
                    catalog.audience_count != null ? `${catalog.view_pct}% open rate` : null,
                    `${catalog.conversion_pct}% conversion`,
                    campaignExpiryText(catalog),
                  ),
                  trailing:
                    (catalog.invoice_value ?? 0) > 0
                      ? formatNumberValue(catalog.invoice_value ?? 0, 'CURRENCY_THRESHOLD')
                      : catalog.gmv > 0
                        ? formatNumberValue(catalog.gmv, 'CURRENCY_THRESHOLD')
                        : '—',
                  selected: catalog.id === openId,
                }))}
              >
                {filtered.map((catalog, index) => {
                  const colSpan = tableColumns.length;
                  return (
                    <Fragment key={catalog.id}>
                      {index === sentinelIndex ? (
                        <tr aria-hidden="true" style={{ height: 0 }}>
                          <td colSpan={colSpan} className="p-0">
                            <div ref={sentinelRef} />
                          </td>
                        </tr>
                      ) : null}
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
                          catalog.id === openId ? 'bg-ember-50' : 'bg-white',
                        )}
                        onClick={() => router.push(`/campaigns/${catalog.id}`)}
                        onPointerDown={() => triggerHaptic()}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <EntityAvatar initials={catalog.initials} hue={catalog.hue} imageUrl={catalog.hero_image_url} size={38} />
                            <div className="min-w-0">
                              <p className="truncate text-base font-medium text-cream-900">{catalog.name}</p>
                              <p className="mt-0.5 truncate text-xs uppercase tracking-[0.05em] text-cream-500">
                                {catalog.products_count} products · {catalog.brands_count} brands
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <p className="text-sm text-cream-800">{catalog.cohort_name}</p>
                            <p className="text-xs text-cream-600">
                              {catalog.audience_count != null ? `${catalog.audience_count} buyers` : '—'}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                          {catalog.order_count > 0 ? catalog.order_count : '—'}
                        </td>
                        {estimatesEnabled ? (
                          <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                            {catalog.estimate_count > 0 ? catalog.estimate_count : '—'}
                          </td>
                        ) : null}
                        <td className="px-3 py-3 text-right font-mono text-base tabular-nums text-cream-900">
                          {catalog.gmv > 0 ? formatNumberValue(catalog.gmv, 'CURRENCY_THRESHOLD') : '—'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-cream-900">
                              {(catalog.invoice_value ?? 0) > 0 ? formatNumberValue(catalog.invoice_value ?? 0, 'CURRENCY_THRESHOLD') : '—'}
                            </p>
                            <p className="text-xs text-cream-600">
                              {(catalog.invoice_count ?? 0) > 0 ? `${catalog.invoice_count} invoices · ${catalog.revenue_buyer_count ?? 0} customers` : '—'}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-cream-900">
                              {catalog.views > 0 ? catalog.views : '—'}
                            </p>
                            <p className="text-xs text-cream-600">
                              {catalog.audience_count ? `${catalog.view_pct}% of buyers` : '—'}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-cream-900">
                              {catalog.demand_customers ?? 0}
                            </p>
                            <p className="text-xs text-cream-600">{catalog.conversion_pct}% conversion</p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
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
                        <td className="px-3 py-3 text-right text-cream-500">›</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </LandingTable>
            )}

            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Skeleton className="h-8 w-48 rounded-full" />
              </div>
            )}

            <CampaignFormSheet open={campaignFormOpen} onOpenChange={setCampaignFormOpen} mode="create" />
          </>
        )}
      </div>
    </PageWrap>
  );
}

export function CatalogsLandingClient({
  initialData,
  initialMetrics = null,
  initialPeriod: _initialPeriod,
  initialSearch,
}: {
  initialData: CatalogsLandingResponse | null;
  initialMetrics?: CatalogsLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="CATALOG_PUBLISHING">
      <CatalogsLandingContent initialData={initialData} initialMetrics={initialMetrics} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
