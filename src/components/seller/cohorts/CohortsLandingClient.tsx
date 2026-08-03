'use client';

import { Fragment, useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import Link from 'next/link';

import { FeatureGate } from '@/components/FeatureGate';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SellerMobileListSkeleton } from '@/components/seller/mobile';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useCohortsLanding, type CohortsLandingResponse } from '@/hooks/useCohorts';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { cn, formatNumberValue } from '@/lib/utils';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { CustomerGroupFormSheet } from './CustomerGroupFormSheet';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)';

const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)'];

function CohortsDataSkeleton({ isPaneOpen }: { isPaneOpen?: boolean }) {
  if (isPaneOpen) {
    return <SellerMobileListSkeleton count={6} forceVisible />;
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
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
}: {
  initialData: CohortsLandingResponse | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = openId != null;
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const [formOpen, setFormOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('customers-assigned');
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-cohorts-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/customer-groups',
    version: 4,
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
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useCohortsLanding(period, { search, brands: filters.brands }, initialData);
  useRouteScrollRestoration({
    storageKey: 'seller-cohorts-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/customer-groups',
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

    const interimRows = isFetching !== false ? rows.filter((row) =>
        brandFilter.length === 0 ||
        row.allowed_tenant_brand_ids?.some((brandId) => brandFilter.includes(brandId))
      )
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          (row.description ?? '').toLowerCase().includes(query)
        );
      }) : rows;
    return interimRows
      .sort((a, b) => {
        if (sortBy === 'GMV (low → high)') return a.gmv_mtd - b.gmv_mtd;
        return b.gmv_mtd - a.gmv_mtd;
      });
  }, [filters.brands, isFetching, landingData?.cohorts, search, sortBy]);

  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(filtered.length, SELLER_INFINITE_SCROLL_RATIO),
    [filtered.length],
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: Boolean(hasNextPage),
    isLoading: isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
  });

  const formatAllowedBrands = (cohort: { allowed_tenant_brand_ids?: string[] | null }) => {
    const ids = cohort.allowed_tenant_brand_ids ?? [];
    if (ids.length === 0) return 'All brands';
    const names = ids.map((id) => brandNameById.get(id) ?? id).filter(Boolean);
    if (names.length === 0) return 'All brands';
    const visible = names.slice(0, 3);
    return names.length > 3 ? `${visible.join(', ')} + ${names.length - 3} more` : visible.join(', ');
  };

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
  const showRefreshingState = isLoading && !data;

  const kpis = landingData?.kpis;

  const kpiOptions = [
    {
      id: 'customers-assigned',
      label: 'Customers assigned to a Group',
      value: `${kpis?.covered_members ?? 0}`,
      sub: `${kpis?.total_buyers ? Math.round(((kpis.covered_members ?? 0) / kpis.total_buyers) * 100) : 0}% of ${kpis?.total_buyers ?? 0} customers`,
    },
    {
      id: 'valuable-uncategorised',
      label: 'Valuable customers in no Group',
      value: `${kpis?.uncategorised_buyers ?? 0}`,
      sub: `90D invoiced sales — NEEDS BACKEND`,
    },
    {
      id: 'grouped-purchase-rate',
      label: 'Grouped customers who purchased',
      value: `${formatNumberValue((kpis?.avg_conversion_pct ?? 0), 'PERCENTAGE')}`,
      sub: 'Average purchase rate across groups',
    },
  ];
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <PageHeader
          eyebrow={isPaneOpen ? 'Customer Groups' : 'Segmentation'}
          title={isPaneOpen ? selectedOption.label : 'Customer Groups'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${kpis?.total_cohorts ?? 0} customer groups · ${kpis?.covered_members ?? 0} of ${kpis?.total_buyers ?? 0} active customers assigned.`}
          horizon={horizonLabel}
          primary="Add a customer group"
          onPrimaryClick={() => setFormOpen(true)}
          compact={isPaneOpen}
        />

        {showRefreshingState || isError ? null : (
          <>
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
              count={`${filtered.length} customer groups`}
              searchPlaceholder="Search customer group…"
              chips={[]}
              activeChip=""
              sortBy={sortBy}
              hideViewToggle
              compact={isPaneOpen}
              groups={groups}
              searchValue={search}
              onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
              sortOptions={[...SORT_OPTIONS]}
              onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
            />
          </>
        )}
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {showRefreshingState ? (
        <CohortsDataSkeleton isPaneOpen={isPaneOpen} />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load customer groups"
          description="There was a problem fetching your customer groups. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
      <CustomerGroupFormSheet open={formOpen} onOpenChange={setFormOpen} mode="create" />

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
            <Button variant="accent" onClick={() => setFormOpen(true)}>
                <Plus size={13} />
                Add a customer group
            </Button>
          }
        />
      ) : (
        <LandingTable
          columns={[
            { label: 'Customer group', minWidth: 280, maxWidth: 360, className: 'px-5' },
            { label: 'Type', minWidth: 160, maxWidth: 180, className: 'px-5' },
            { label: 'Allowed brands', minWidth: 220, maxWidth: 340, className: 'px-5' },
            { label: 'Members who purchased', align: 'right', minWidth: 140, maxWidth: 180, className: 'px-5' },
            { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
            { label: 'Status', minWidth: 140, maxWidth: 180, className: 'px-5' },
            { width: 40, className: 'px-4' },
          ]}
          tableMinWidth={1260}
          forceCompact={isPaneOpen}
          sentinelIndex={sentinelIndex}
          sentinelRef={sentinelRef}
          mobileRows={filtered.map((cohort) => ({
            id: cohort.id,
            href: `/customer-groups/${cohort.id}`,
            primary: cohort.name,
            supporting: cohort.is_static ? 'Manual selection' : 'Rule based',
            meta: `${cohort.active_members}/${cohort.total_members} members`,
            trailing: formatNumberValue(cohort.gmv_mtd, 'CURRENCY_THRESHOLD'),
            selected: cohort.id === openId,
          }))}
        >
          {filtered.map((cohort, index) => (
            <Fragment key={cohort.id}>
            {index === sentinelIndex ? (
              <tr aria-hidden="true" style={{ height: 0 }}>
                <td colSpan={7} className="p-0"><div ref={sentinelRef} /></td>
              </tr>
            ) : null}
            <tr
              className={cn(
                'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
                cohort.id === openId ? 'bg-ember-50' : 'bg-white',
              )}
              onClick={() => router.push(`/customer-groups/${cohort.id}`)}
              onPointerDown={() => triggerHaptic()}
            >
              <td className="px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-cream-900">{cohort.name}</p>
                  <p className="mt-0.5 truncate text-xs text-cream-600">{cohort.description ?? '—'}</p>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-cream-800">{cohort.is_static ? 'Manual selection' : 'Rule based'}</td>
              <td className="px-3 py-2 text-sm text-cream-800">{formatAllowedBrands(cohort)}</td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">
                {cohort.active_members}/{cohort.total_members}
              </td>
              <td className="px-3 py-2 text-right font-mono text-base tabular-nums text-cream-900">
                {formatNumberValue(cohort.gmv_mtd, 'CURRENCY_THRESHOLD')}
              </td>
              <td className="px-3 py-2">
                <div className="space-y-1">
                  <StatusTag tone={cohort.status_tone} label={cohort.status_label} />
                </div>
              </td>
              <td className="px-3 py-2 text-right text-cream-500">›</td>
            </tr>
            </Fragment>
          ))}
        </LandingTable>
      )}
        </>
      )}
      </div>
    </PageWrap>
  );
}

export function CohortsLandingClient({
  initialData,
}: {
  initialData: CohortsLandingResponse | null;
}) {
  return (
    <FeatureGate flag="COHORTS">
      <CohortsLandingContent initialData={initialData} />
    </FeatureGate>
  );
}
