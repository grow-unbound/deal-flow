'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, MapPin, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  GrowthPill,
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import {
  useLocationsLanding,
  type LocationsLandingResponse,
  type LocationsLandingRow,
} from '@/hooks/useLocations';
import { formatCompactInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LocationFormSheet } from '@/components/seller/settings/LocationFormSheet';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Outstanding dues (high → low)';
type ChipOption = 'All' | 'Active' | 'Stock issues' | 'Has dues';

const CHIPS: ChipOption[] = ['All', 'Active', 'Stock issues', 'Has dues'];
const SORT_OPTIONS: SortOption[] = ['GMV (high → low)', 'GMV (low → high)', 'Outstanding dues (high → low)'];

function LocationsLandingSkeleton() {
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
        <Skeleton className="h-[320px] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

function LocationsDataSkeleton() {
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
      <Skeleton className="h-[320px] rounded-[14px]" />
    </div>
  );
}

function stockTone(status: LocationsLandingRow['stock_status']): 'success' | 'warning' | 'danger' {
  if (status === 'clear') return 'success';
  if (status === 'low_stock') return 'warning';
  return 'danger';
}

function stockLabel(status: LocationsLandingRow['stock_status']): string {
  if (status === 'clear') return 'Clear';
  if (status === 'low_stock') return 'Low stock';
  return 'Out of stock';
}

function LocationsLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: LocationsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { period, setPeriod, horizonLabel, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError, refetch } = useLocationsLanding(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-locations-landing',
    scopeKey: period,
    initialState: {
      search: '',
      activeChip: 'All' as ChipOption,
      sortBy: 'GMV (high → low)' as SortOption,
    },
  });
  useRouteScrollRestoration({
    storageKey: 'seller-locations-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  const search = routeState.search;
  const activeChip = routeState.activeChip;
  const sortBy = routeState.sortBy;

  const filtered = useMemo(() => {
    const rows = landingData?.locations ?? [];
    const query = search.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (activeChip === 'All') return true;
        if (activeChip === 'Active') return row.is_active;
        if (activeChip === 'Stock issues') return row.stock_status !== 'clear';
        if (activeChip === 'Has dues') return row.outstanding_dues > 0;
        return true;
      })
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          row.type.toLowerCase().includes(query) ||
          row.city.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'GMV (high → low)') return b.gmv_mtd - a.gmv_mtd;
        if (sortBy === 'GMV (low → high)') return a.gmv_mtd - b.gmv_mtd;
        return b.outstanding_dues - a.outstanding_dues;
      });
  }, [activeChip, landingData?.locations, search, sortBy]);

  if (isLoading && !landingData) return <LocationsLandingSkeleton />;

  if (isError && !landingData) {
    return (
      <PageWrap>
        <ErrorState
          heading="Couldn't load locations"
          description="There was a problem fetching your locations. Please try again."
          onRetry={() => refetch()}
        />
      </PageWrap>
    );
  }

  if (!landingData) return <LocationsLandingSkeleton />;

  const showRefreshingState = isLoading && !data;

  const kpis = landingData.kpis;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Operations"
        title="Locations"
        subtitle="Your branches and godowns. Track stock health, outstanding dues, and GMV contribution per location."
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Add location"
        onPrimaryClick={() => setSheetOpen(true)}
        secondary={{ label: 'Import', icon: <Upload size={13} /> }}
      />

      {showRefreshingState ? (
        <LocationsDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load locations"
          description="There was a problem fetching your locations. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <InsightStrip4
            tiles={[
              {
                label: 'Active locations',
                value: `${kpis.active_locations}`,
                sub: `${kpis.total_locations} total branches / godowns`,
              },
              {
                label: 'Outstanding dues',
                value: formatCompactInr(kpis.outstanding_dues_total),
                sub: `across ${kpis.dues_location_count} locations`,
                tone: kpis.outstanding_dues_total > 0 ? 'warn' : undefined,
              },
              {
                label: 'Low-stock locations',
                value: `${kpis.low_stock_locations}`,
                sub: '< 7d cover on key SKUs',
                tone: kpis.low_stock_locations > 0 ? 'warn' : undefined,
              },
              {
                label: 'Top location share',
                value: `${kpis.top_location_gmv_share_pct}%`,
                sub: kpis.top_location_name ? `${kpis.top_location_name} leads` : '—',
              },
            ]}
          />

          <V3CalloutPanel
            items={[
              {
                kind: 'risk',
                eyebrow: 'Stock critical',
                hint: `${landingData.callouts.stock_critical.length} locations`,
                rows: landingData.callouts.stock_critical.map((row) => ({
                  initials: row.initials,
                  hue: 'ember' as const,
                  name: row.name,
                  reason: `${row.critical_sku_count} SKUs critical`,
                  trailing: <StatusTag tone="danger" label="Stock out" />,
                })),
              },
              {
                kind: 'info',
                eyebrow: 'Top locations',
                hint: 'by GMV',
                rows: landingData.callouts.top_locations.map((row) => ({
                  initials: row.initials,
                  hue: 'teal' as const,
                  name: row.name,
                  reason: `${row.orders_count} orders · ${row.buyers_count} buyers`,
                  trailing: formatCompactInr(row.gmv_mtd ?? 0),
                })),
              },
              {
                kind: 'risk',
                eyebrow: 'Collections overdue',
                hint: `${landingData.callouts.collections_overdue.length} locations`,
                rows: landingData.callouts.collections_overdue.map((row) => ({
                  initials: row.initials,
                  hue: 'ember' as const,
                  name: row.name,
                  reason: `₹${formatCompactInr(row.outstanding_dues ?? 0)} · oldest ${row.oldest_unpaid_days}d unpaid`,
                  trailing: <StatusTag tone="danger" label="Overdue" />,
                })),
              },
            ]}
          />

          <FilterBar
            count={`${filtered.length} locations`}
            searchPlaceholder="Search location…"
            chips={CHIPS}
            activeChip={activeChip}
            sortBy={sortBy}
            hideViewToggle
            searchValue={search}
            onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
            onChipChange={(chip) => setRouteState((current) => ({ ...current, activeChip: chip as ChipOption }))}
            sortOptions={[...SORT_OPTIONS]}
            onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={<MapPin size={28} strokeWidth={1.5} />}
              heading={search.trim() || activeChip !== 'All' ? 'No matching locations' : 'No locations yet'}
              description={
                search.trim() || activeChip !== 'All'
                  ? 'Try a different search or filter.'
                  : 'Add your branches and godowns to track stock and dues per location.'
              }
            />
          ) : (
            <div className="v2-body overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 bg-cream-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-600 w-[260px]">Location</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">GMV · MTD</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">Growth</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">Active buyers</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">Outstanding dues</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">Stock status</th>
                    <th className="w-8 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/locations/${row.id}`)}
                      className="cursor-pointer border-b border-cream-100 hover:bg-cream-50 transition-colors"
                    >
                      <td className="px-4 py-3 w-[260px]">
                        <div className="flex items-center gap-3">
                          <EntityAvatar size={38} initials={row.initials} hue="teal" />
                          <div>
                            <p className="ent-name font-medium text-cream-900">{row.name}</p>
                            <p className="text-xs text-cream-600">{row.type} · {row.city}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-cream-900">
                        {row.gmv_mtd > 0 ? formatCompactInr(row.gmv_mtd) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <GrowthPill value={row.growth_pct} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-cream-900">
                        {row.active_buyers}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.outstanding_dues > 0 ? (
                          <span className="text-danger-600 font-mono font-semibold">
                            ₹{formatCompactInr(row.outstanding_dues)}
                          </span>
                        ) : (
                          <span className="text-cream-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag tone={stockTone(row.stock_status)} label={stockLabel(row.stock_status)} />
                      </td>
                      <td className="w-8 px-2 py-3 text-right">
                        <ChevronRight size={14} className="text-cream-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <LocationFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingLocation={null} />
    </PageWrap>
  );
}

export function LocationsLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: LocationsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <LocationsLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
