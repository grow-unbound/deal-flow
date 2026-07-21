'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, MapPin, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
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
import { Skeleton } from '@/components/ui/skeleton';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import {
  useLocationsLanding,
  type LocationsLandingResponse,
  type LocationsLandingRow,
} from '@/hooks/useLocations';
import { formatNumberValue } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { LocationFormSheet } from '@/components/seller/settings/LocationFormSheet';
import { LocationsLandingSkeleton as SharedLocationsLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingPageLoadMore } from '@/components/seller/layout/LandingPageLoadMore';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';

type SortOption = 'GMV (high → low)' | 'GMV (low → high)' | 'Outstanding dues (high → low)';
const STATUS_OPTIONS = ['Active', 'Inactive'] as const;
const STOCK_OPTIONS = ['In Stock', 'Low Stock', 'Out of Stock'] as const;
const DUE_OPTIONS = ['Due', 'Overdue'] as const;
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
  initialSearch,
}: {
  initialData: LocationsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const period: SellerLandingPeriod = 'last90';
  const horizonLabel = 'Trailing 90 days';
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-locations-landing',
    scopeKey: 'fixed-90d',
    version: 4,
    initialState: {
      search: '',
      filters: {
        status: [] as string[],
        stock: [] as string[],
        dues: [] as string[],
      },
      sortBy: 'GMV (high → low)' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const sortBy = routeState.sortBy;
  const filters = routeState.filters ?? { status: [], stock: [], dues: [] };
  const hasTableControls = Boolean(search.trim() || filters.status.length > 0 || filters.stock.length > 0 || filters.dues.length > 0);
  const { data, isLoading, isError, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useLocationsLanding(period, { search, status: filters.status, stock: filters.stock, dues: filters.dues }, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const summaryData = useRetainedValue<LocationsLandingResponse | undefined>(
    !hasTableControls ? landingData : initialData ?? undefined,
  );
  useRouteScrollRestoration({
    storageKey: 'seller-locations-landing',
    scopeKey: 'fixed-90d',
    ready: !isLoading,
  });
  const groups: FilterBarGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: STATUS_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.status ?? [],
      onChange: (values) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), status: values },
      })),
    },
    {
      key: 'stock',
      label: 'Stock',
      options: STOCK_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.stock ?? [],
      onChange: (values) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), stock: values },
      })),
    },
    {
      key: 'dues',
      label: 'Dues',
      options: DUE_OPTIONS.map((value) => ({ value, label: value })),
      values: filters.dues ?? [],
      onChange: (values) => setRouteState((current) => ({
        ...current,
        filters: { ...(current.filters ?? filters), dues: values },
      })),
    },
  ];

  const filtered = useMemo(() => {
    const rows = landingData?.locations ?? [];
    const query = search.trim().toLowerCase();
    const statusFilter = filters.status ?? [];
    const stockFilter = filters.stock ?? [];
    const duesFilter = filters.dues ?? [];

    return rows
      .filter((row) => {
        const statusOk =
          statusFilter.length === 0 || statusFilter.includes('All') || (statusFilter.includes('Active') ? row.is_active : !row.is_active);
        const stockOk =
          stockFilter.length === 0 ||
          stockFilter.includes('All') ||
          stockFilter.some((value) => {
            if (value === 'In Stock') return row.stock_status === 'clear';
            if (value === 'Low Stock') return row.stock_status === 'low_stock';
            if (value === 'Out of Stock') return row.stock_status === 'out_of_stock';
            return false;
          });
        const duesOk =
          duesFilter.length === 0 ||
          duesFilter.includes('All') ||
          duesFilter.some((value) => {
            if (value === 'Due') return row.outstanding_dues > 0;
            if (value === 'Overdue') return row.outstanding_dues > 0 && (row.oldest_unpaid_days ?? 0) > 0;
            return false;
          });
        return statusOk && stockOk && duesOk;
      })
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          row.city.toLowerCase().includes(query) ||
          row.address_text.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'GMV (high → low)') return b.gmv_mtd - a.gmv_mtd;
        if (sortBy === 'GMV (low → high)') return a.gmv_mtd - b.gmv_mtd;
        return b.outstanding_dues - a.outstanding_dues;
      });
  }, [filters.dues, filters.status, filters.stock, landingData?.locations, search, sortBy]);

  if (isLoading && !landingData) return <SharedLocationsLandingSkeleton />;

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

  if (!landingData) return <SharedLocationsLandingSkeleton />;

  const showRefreshingState = isLoading && !data;
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filtered.length === 0;
  const kpis = summaryData?.kpis ?? landingData.kpis;
  const callouts = summaryData?.callouts ?? landingData.callouts;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Operations"
        title="Locations"
        subtitle={`${kpis.active_locations} active locations · ${kpis.linked_warehouse_count} linked warehouses.`}
        horizon={horizonLabel}
        primary="Add location"
        onPrimaryClick={() => setSheetOpen(true)}
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
                label: 'Invoiced sales 90D',
                value: formatNumberValue(filtered.reduce((sum, row) => sum + row.gmv_mtd, 0), 'CURRENCY_THRESHOLD'),
                sub: `${filtered.length} active locations in view`,
              },
              {
                label: 'Overdue amount',
                value: formatNumberValue(kpis.outstanding_dues_total, 'CURRENCY_THRESHOLD'),
                sub: `across ${kpis.dues_location_count} locations`,
                tone: kpis.outstanding_dues_total > 0 ? 'warn' : undefined,
              },
              {
                label: 'Customers who bought',
                value: formatNumberValue(filtered.reduce((sum, row) => sum + row.active_buyers, 0), 'COUNT'),
                sub: `across ${kpis.active_locations} locations`,
              },
              {
                label:
                  kpis.open_primary_demand_kind === 'orders'
                    ? 'Open order value'
                    : kpis.open_primary_demand_kind === 'estimates'
                      ? 'Open estimate value'
                      : 'Open primary demand value',
                value: kpis.open_primary_demand_kind === 'none' ? '—' : formatNumberValue(kpis.open_primary_demand_value, 'CURRENCY_THRESHOLD'),
                sub:
                  kpis.open_primary_demand_kind === 'none'
                    ? 'Enable Estimates or Sales Orders'
                    : `across ${kpis.active_locations} locations`,
                tone: kpis.open_primary_demand_kind === 'none' ? 'warn' : undefined,
              },
            ]}
          />

          <V3CalloutPanel
            items={[
              {
                id: 'conversions',
                kind: 'info',
                eyebrow: 'Locations with expiring estimates',
                hint: `${callouts.conversions.length}`,
                rows: callouts.conversions.map((row) => ({
                  initials: row.initials,
                  hue: 'teal' as const,
                  name: row.name,
                  reason: `${row.estimate_number} · exp in ${row.expires_in_days}d`,
                  trailing: formatNumberValue(row.total_amount ?? 0, 'CURRENCY_THRESHOLD'),
                })),
              },
              {
                id: 'top_locations',
                kind: 'info',
                eyebrow: 'Locations driving sales',
                hint: `${callouts.top_locations.length}`,
                rows: callouts.top_locations.map((row) => ({
                  initials: row.initials,
                  hue: 'teal' as const,
                  name: row.name,
                  reason: `${row.orders_count} orders · ${row.buyers_count} buyers`,
                  trailing: formatNumberValue(row.gmv_mtd ?? 0, 'CURRENCY_THRESHOLD'),
                })),
              },
              {
                id: 'collections_overdue',
                kind: 'risk',
                eyebrow: 'Locations with overdue balances',
                hint: `${callouts.collections_overdue.length}`,
                rows: callouts.collections_overdue.map((row) => ({
                  initials: row.initials,
                  hue: 'ember' as const,
                  name: row.name,
                  reason: `${formatNumberValue(row.outstanding_dues ?? 0, 'CURRENCY_THRESHOLD')} · oldest ${row.oldest_unpaid_days}d unpaid`,
                  trailing: <StatusTag tone="danger" label="Overdue" />,
                })),
              },
            ]}
          />

          <FilterBar
            count={`${filtered.length} locations`}
            searchPlaceholder="Search location…"
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

          {showTableSkeleton ? (
            <LandingTableRowsSkeleton columns={12} tableMinWidth={1700} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<MapPin size={28} strokeWidth={1.5} />}
              heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching locations' : 'No locations yet'}
              description={
                search.trim() || groups.some((group) => group.values.length > 0)
                  ? 'Try a different search or filter.'
                  : 'Add your branches and godowns to track stock and dues per location.'
              }
            />
          ) : (
          <LandingTable
            columns={[
                { label: 'Location', width: 220, minWidth: 200, maxWidth: 360, className: 'px-5' },
                { label: 'Sales · 90D', align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
                { label: 'Invoices · 90D', align: 'right', minWidth: 120, maxWidth: 140, className: 'px-5' },
                { label: kpis.open_primary_demand_kind === 'orders' ? 'Order value · 90D' : 'Estimate value · 90D', align: 'right', minWidth: 140, maxWidth: 170, className: 'px-5' },
                { label: kpis.open_primary_demand_kind === 'orders' ? 'Orders · 90D' : 'Estimates · 90D', align: 'right', minWidth: 140, maxWidth: 160, className: 'px-5' },
                { label: 'Conversion · 90D', align: 'right', minWidth: 130, maxWidth: 150, className: 'px-5' },
                { label: 'Active customers', align: 'right', minWidth: 130, maxWidth: 160, className: 'px-5' },
                { label: 'Overdue amount', align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
                { label: 'Stock status', minWidth: 160, maxWidth: 200, className: 'px-5' },
                { width: 40, className: 'px-4' },
              ]}
              tableMinWidth={1700}
            >
              {filtered.map((row) => {
                const demandCount = kpis.open_primary_demand_kind === 'orders' ? row.order_count_90d : row.estimate_count_90d;
                const demandValue = kpis.open_primary_demand_kind === 'orders' ? row.order_value_90d : row.estimate_value_90d;
                return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/locations/${row.id}`)}
                  className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <EntityAvatar size={38} initials={row.initials} hue="teal" />
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-cream-900">{row.name}</p>
                        <p className="mt-0.5 truncate text-xs text-cream-600">{row.address_text || row.city || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.gmv_mtd > 0 ? formatNumberValue(row.gmv_mtd, 'CURRENCY_THRESHOLD') : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.invoice_count_90d > 0 ? row.invoice_count_90d : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {kpis.open_primary_demand_kind === 'none' ? '—' : demandValue > 0 ? formatNumberValue(demandValue, 'CURRENCY_THRESHOLD') : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {kpis.open_primary_demand_kind === 'none' ? '—' : demandCount > 0 ? demandCount : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {kpis.open_primary_demand_kind === 'none' ? '—' : row.conversion_90d > 0 ? `${row.conversion_90d}%` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.active_buyers}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-base tabular-nums text-cream-900">
                    {row.outstanding_dues > 0 ? formatNumberValue(row.outstanding_dues, 'CURRENCY_THRESHOLD') : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusTag tone={stockTone(row.stock_status)} label={stockLabel(row.stock_status)} />
                  </td>
                  <td className="px-4 py-3.5 text-right text-cream-500">
                    <ChevronRight size={14} className="text-cream-400" />
                  </td>
                </tr>
                );
              })}
            </LandingTable>
          )}
        </>
      )}

      <LandingPageLoadMore hasMore={Boolean(hasNextPage)} loading={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

      <LocationFormSheet open={sheetOpen} onOpenChange={setSheetOpen} editingLocation={null} />
    </PageWrap>
  );
}

export function LocationsLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: LocationsLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="BRAND_PRODUCT_MASTER">
      <LocationsLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
