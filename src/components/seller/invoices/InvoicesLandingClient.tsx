'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  PageHeader,
  PageWrap,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { TransactionTable } from '@/components/seller/transactional';
import { SellerMobileTransactionTabs, SellerSplitPaneLandingSkeleton, SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import {
  useTenantInvoicesInfinite,
  useTenantInvoicesMetrics,
  type InvoicesLandingKpiCardV4,
  type InvoicesLandingMetricsV4,
  type TenantInvoicesResponse,
} from '@/hooks/useInvoices';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAsOfLabel, formatNumberValue } from '@/lib/utils';
import { INVOICES_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { parseSellerLandingPeriod, type SellerLandingPeriod } from '@/lib/seller-period';
import { InvoicesLandingSkeleton, TableRowsSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first' | 'Value (high → low)' | 'Outstanding (high → low)';
const SORT_OPTIONS: SortOption[] = ['Recent first', 'Value (high → low)', 'Outstanding (high → low)'];

function matchesInvoiceSearch(invoice: TenantInvoicesResponse['invoices'][number], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    invoice.invoice_number,
    invoice.buyer_name,
    invoice.location_name,
    invoice.source_label,
    invoice.source_detail,
    invoice.campaign_name ?? null,
    invoice.place_of_supply ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function buyerGeographyLabel(row: Pick<TenantInvoicesResponse['invoices'][number], 'buyer_city' | 'buyer_state'>) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function invoiceSourceFilterLabel(row: TenantInvoicesResponse['invoices'][number]) {
  if (row.source_kind === 'converted') return 'Converted';
  if (row.source_kind === 'buyer_app') return 'Buyer App';
  return 'Direct';
}

function filtersFromInvoicePreset(preset: Record<string, unknown> | null | undefined) {
  let due: string[] = [];
  if (preset?.overdue === true) due = ['Overdue'];
  else if (Number(preset?.due_lte_days ?? 0) > 0) due = ['Due in 7 days'];
  else if (preset && 'balance_gt' in preset) due = ['Outstanding'];
  return {
    source: [] as string[],
    status: [] as string[],
    due,
    location_id: [] as string[],
  };
}

function periodFromInvoicePreset(preset: Record<string, unknown> | null | undefined): SellerLandingPeriod | null {
  if (!preset || typeof preset.date_period !== 'string') return null;
  if (preset.date_period === 'today') return 'today';
  if (preset.date_period === 'this_week') return 'week';
  if (preset.date_period === 'this_quarter') return 'quarter';
  if (preset.date_period === 'this_month') return 'month';
  return null;
}

function asInvoicesMetrics(data: InvoicesLandingMetricsV4 | TenantInvoicesResponse | null | undefined): InvoicesLandingMetricsV4 | null {
  if (data && 'cards' in data && Array.isArray(data.cards)) return data;
  return null;
}

function InvoicesLandingContent({
  initialMetrics,
  initialPeriod,
}: {
  initialMetrics: InvoicesLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/invoices');
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search')?.trim() || undefined;
  const clientInitialPeriod = searchParams.get('period') ? parseSellerLandingPeriod(searchParams.get('period')) : initialPeriod;
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(clientInitialPeriod);
  const metricsQuery = useTenantInvoicesMetrics(period, initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { createInvoices } = useCreateFlags();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-invoices-landing',
    scopeKey: period,
    pathnameOverride: '/invoices',
    version: 4,
    initialState: {
      search: '',
      filters: {
        source: [] as string[],
        status: [] as string[],
        due: [] as string[],
        location_id: [] as string[],
      },
      filterPreset: null as Record<string, unknown> | null,
      sortBy: 'Recent first' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const filters = routeState.filters ?? { source: [], status: [], due: [], location_id: [] };
  const filterPreset = routeState.filterPreset ?? null;
  const sortBy = routeState.sortBy;

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantInvoicesInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters, filter_preset: filterPreset },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  useRouteScrollRestoration({
    storageKey: 'seller-invoices-landing',
    scopeKey: period,
    pathnameOverride: '/invoices',
    ready: !isLoading,
  });

  const firstPage = data?.pages?.[0];
  const allInvoices = useMemo(() => data?.pages?.flatMap((p) => p.invoices) ?? [], [data?.pages]);
  const total = (firstPage as { total?: number | null } | undefined)?.total ?? allInvoices.length;

  // Client-side sort only (server returns DESC by invoice_date)
  const filteredRows = useMemo(() => {
    void sortBy; // acknowledged — only one sort option currently
    return [...allInvoices]
      .filter((invoice) => {
        if (!matchesInvoiceSearch(invoice, search)) {
          return false;
        }

        if (filters.source.length > 0 && !filters.source.includes(invoiceSourceFilterLabel(invoice))) {
          return false;
        }

        if (filters.status.length > 0 && !filters.status.includes(invoice.status.filter_chip)) {
          return false;
        }

        if (filters.location_id.length > 0 && (!invoice.location_id || !filters.location_id.includes(invoice.location_id))) {
          return false;
        }

        if (
          filters.due.length > 0 &&
          !filters.due.some((value) => {
            if (value === 'Overdue') return invoice.status.filter_chip === 'Overdue';
            if (value === 'Due') return invoice.outstanding_amount > 0 && invoice.status.filter_chip !== 'Overdue';
            return false;
          })
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [allInvoices, filters.due, filters.location_id, filters.source, filters.status, search, sortBy]);

  const displayRows = filteredRows;
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(displayRows.length, SELLER_INFINITE_SCROLL_RATIO),
    [displayRows.length],
  );
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && displayRows.length === 0;

  const subtitle = useMemo(() => {
    return `Track receivables and collections ${lowerLabel}.`;
  }, [lowerLabel]);
  const asOfLabel = formatAsOfLabel(metricsData?.computed_at);

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load invoices"
        description="There was a problem fetching the invoices workboard. Please try again."
      />
    );
  }
  const showRefreshingState = isLoading && !data;
  if (showRefreshingState) {
    return isPaneOpen ? (
      <SellerSplitPaneLandingSkeleton ariaLabel="Loading invoices" showTransactionTabs variant="transaction" />
    ) : (
      <InvoicesLandingSkeleton />
    );
  }

  const kpiOptions = (metricsData?.cards ?? []).map((card: InvoicesLandingKpiCardV4) => ({
    id: card.id,
    label: kpiLabel(INVOICES_KPI_COPY, card),
    value: formatNumberValue(Number(card.value ?? 0), 'CURRENCY_THRESHOLD'),
    sub: kpiSupportingText(INVOICES_KPI_COPY, card),
    filterPreset: card.filter_preset ?? null,
  }));
  const selectedOption = selectedKpiKey ? kpiOptions.find((option) => option.id === selectedKpiKey) ?? null : null;
  const groups: FilterBarGroup[] = [
    {
      key: 'period',
      label: 'Period',
      options,
      values: [period],
      onChange: (values: string[]) => {
        setSelectedKpiKey(null);
        setPeriod((values[0] as SellerLandingPeriod | undefined) ?? 'month');
        setRouteState((current) => ({ ...current, filterPreset: null }));
      },
    },
    ...(firstPage?.filters?.groups ?? []).map((group) => ({
      key: group.key,
      label: group.label,
      options: group.options,
      values: filters[group.key as keyof typeof filters] ?? [],
      onChange: (values: string[]) => setRouteState((current) => ({
        ...current,
        filterPreset: null,
        filters: { ...(current.filters ?? filters), [group.key]: values },
      })),
    })),
  ];

  return (
    <PageWrap className="max-w-[1920px] flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <SplitPaneStickyHeaderSlot
          isPaneOpen={isPaneOpen}
          showRefreshingState={showRefreshingState}
          isError={isError}
          showTransactionTabs
        >
        <PageHeader
          eyebrow={isPaneOpen ? 'Invoices' : 'Billing'}
          title={isPaneOpen ? selectedOption?.label ?? 'Invoices' : 'Invoices'}
          subtitle={isPaneOpen && selectedOption ? `${selectedOption.value} · ${selectedOption.sub}` : subtitle}
          horizon={horizonLabel}
          showHorizonControl={false}
          primary={createInvoices ? 'Add an invoice' : undefined}
          onPrimaryClick={createInvoices ? () => router.push('/invoices/new') : undefined}
          compact={isPaneOpen}
        />
        <SellerMobileTransactionTabs active="invoices" />

        {isPaneOpen ? null : (
          <>
            <InsightStrip4
              tiles={kpiOptions.map((option): InsightTile => ({
                label: option.label,
                value: option.value,
                sub: option.sub,
                onClick: () => {
                  setSelectedKpiKey(option.id);
                  const presetPeriod = periodFromInvoicePreset(option.filterPreset);
                  if (presetPeriod && presetPeriod !== period) setPeriod(presetPeriod);
                  setRouteState((current) => ({
                    ...current,
                    filterPreset: option.filterPreset,
                    filters: filtersFromInvoicePreset(option.filterPreset),
                  }));
                },
                selected: option.id === selectedKpiKey,
              }))}
            />
            {asOfLabel ? (
              <p className="mt-2 mb-1 text-right text-xs text-cream-600">{asOfLabel}</p>
            ) : null}
          </>
        )}

        <FilterBar
          count={`${displayRows.length} of ${total} invoices${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
          searchPlaceholder="Search invoice number…"
          chips={[]}
          activeChip=""
          sortBy={sortBy}
          hideViewToggle
          compact={isPaneOpen}
          groups={groups}
          searchValue={search}
          onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value, filterPreset: null }))}
          sortOptions={SORT_OPTIONS}
          onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
        />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {(
        <>
          {showTableSkeleton ? (
            isPaneOpen ? (
              <SplitPaneListRowsSkeleton isPaneOpen variant="transaction" />
            ) : (
              <TableRowsSkeleton gridClassName="grid-cols-[1.6fr_1.2fr_1fr_0.8fr_0.8fr_0.8fr_40px]" cellCount={7} />
            )
          ) : displayRows.length === 0 ? (
            <EmptyState
              icon={<Receipt size={28} strokeWidth={1.5} />}
              heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching invoices' : 'No invoices yet'}
              description={
                search.trim() || groups.some((group) => group.values.length > 0)
                  ? 'Try a different search or filter combination.'
                  : 'Create an invoice to bill a buyer.'
              }
              action={
                createInvoices ? (
                  <Button variant="accent" asChild>
                    <Link href="/invoices/new" className="inline-flex items-center gap-1.5">
                      <Plus size={13} />
                      Add an invoice
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TransactionTable
              kind="invoice"
              forceCompact={isPaneOpen}
              selectedId={openId}
              showCampaignColumn={showCampaignColumn}
              tableMinWidth={showCampaignColumn ? 1480 : 1260}
              sentinelIndex={sentinelIndex}
              sentinelRef={sentinelRef}
              rows={displayRows.map((row) => ({
                id: row.id,
                href: `/invoices/${row.id}`,
                document_number: row.invoice_number,
                is_buyer_app: row.source_kind === 'buyer_app' || row.source_detail === 'BUYER_APP',
                source_kind: row.source_kind,
                source_label: row.source_kind === 'converted' ? row.source_label : null,
                buyer_name: row.buyer_name,
                buyer_place_of_supply: row.place_of_supply ?? buyerGeographyLabel(row),
                buyer_initials: row.buyer_initials,
                buyer_hue: row.buyer_hue,
                location_name: row.location_name,
                campaign_name: row.campaign_name,
                items_count: row.items_count,
                total_amount: row.total_amount,
                outstanding_amount: row.outstanding_amount,
                amount_subtext: null,
                status_label: row.status.label,
                status_tone: row.status.tone,
                created_at: row.created_at,
                due_at: row.due_date,
              }))}
              onRowClick={(row) => router.push(row.href)}
            />
          )}

          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-8 w-48 rounded-full" />
            </div>
          )}
        </>
      )}
      </div>
    </PageWrap>
  );
}

export function InvoicesLandingClient({
  initialMetrics,
  initialData,
  initialPeriod,
}: {
  initialMetrics?: InvoicesLandingMetricsV4 | null;
  initialData?: InvoicesLandingMetricsV4 | TenantInvoicesResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');

  if (orderManagement === false || invoicesFlag === false) {
    return <FeatureDisabledState />;
  }

  return <InvoicesLandingContent initialMetrics={initialMetrics ?? asInvoicesMetrics(initialData)} initialPeriod={initialPeriod} />;
}
