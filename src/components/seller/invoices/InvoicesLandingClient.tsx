'use client';

import { useDeferredValue, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  PageHeader,
  PageWrap,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { TransactionTable } from '@/components/seller/transactional';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import { useTenantInvoices, useTenantInvoicesInfinite, type TenantInvoicesResponse } from '@/hooks/useInvoices';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactInr, formatDate, formatInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { InvoicesLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

type SortOption = 'Recent first';
const SORT_OPTIONS: SortOption[] = ['Recent first'];

function matchesInvoiceSearch(invoice: TenantInvoicesResponse['invoices'][number], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    invoice.invoice_number,
    invoice.buyer_name,
    invoice.location_name,
    invoice.source_label,
    invoice.campaign_name ?? null,
    invoice.place_of_supply ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function buyerGeographyLabel(row: Pick<TenantInvoicesResponse['invoices'][number], 'buyer_city' | 'buyer_state'>) {
  return [row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || '—';
}

function mapRowToCallout(row: Pick<TenantInvoicesResponse['invoices'][number], 'buyer_initials' | 'buyer_hue' | 'buyer_name'>) {
  return {
    initials: row.buyer_initials,
    hue: row.buyer_hue,
    name: row.buyer_name,
  };
}

function invoiceSupportText(row: Pick<TenantInvoicesResponse['invoices'][number], 'invoice_number' | 'due_date'>) {
  return `${row.invoice_number} · Due ${row.due_date ? formatDate(row.due_date) : '—'}`;
}

function InvoicesLoadingSkeleton() {
  return (
    <PageWrap className="max-w-[1920px]">
      <div className="h-24 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="h-[420px] animate-pulse bg-cream-50" />
      </div>
    </PageWrap>
  );
}

function InvoicesDataSkeleton() {
  return (
    <>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="h-[420px] animate-pulse bg-cream-50" />
      </div>
    </>
  );
}

function InvoicesLandingContent({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantInvoicesResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const summaryQuery = useTenantInvoices(period, initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const showCampaignColumn = useFlagState('CATALOG_PUBLISHING') === true;
  const { createInvoices } = useCreateFlags();
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-invoices-landing',
    scopeKey: period,
    version: 4,
    initialState: {
      search: '',
      filters: {
        source: [] as string[],
        status: [] as string[],
        due: [] as string[],
        location_id: [] as string[],
      },
      sortBy: 'Recent first' as SortOption,
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const search = routeState.search;
  const filters = routeState.filters ?? { source: [], status: [], due: [], location_id: [] };
  const sortBy = routeState.sortBy;

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTenantInvoicesInfinite(
    period,
    { search: debouncedSearch, ...deferredFilters },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-invoices-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  const firstPage = data?.pages?.[0];
  const allInvoices = useMemo(() => data?.pages?.flatMap((p) => p.invoices) ?? [], [data?.pages]);
  const total = (firstPage as { total?: number | null } | undefined)?.total ?? firstPage?.kpis?.invoices_this_period ?? allInvoices.length;

  // Client-side sort only (server returns DESC by invoice_date)
  const filteredRows = useMemo(() => {
    void sortBy; // acknowledged — only one sort option currently
    return [...allInvoices]
      .filter((invoice) => {
        if (!matchesInvoiceSearch(invoice, search)) {
          return false;
        }

        if (filters.source.length > 0 && !filters.source.includes(invoice.source_label)) {
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
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && displayRows.length === 0;
  const latestInvoiceByBuyer = useMemo(() => {
    const latest = new Map<string, TenantInvoicesResponse['invoices'][number]>();

    for (const invoice of summaryData?.invoices ?? []) {
      const currentTime = new Date(invoice.invoice_date).getTime();
      const existing = latest.get(invoice.buyer_id);
      const existingTime = existing ? new Date(existing.invoice_date).getTime() : Number.NEGATIVE_INFINITY;
      if (!existing || currentTime >= existingTime) {
        latest.set(invoice.buyer_id, invoice);
      }
    }

    return latest;
  }, [summaryData?.invoices]);

  const subtitle = useMemo(() => {
    const kpis = summaryData?.kpis;
    if (!kpis) {
      return `Track receivables and collections ${lowerLabel}.`;
    }
    return `${kpis.invoices_this_period} invoices ${lowerLabel} with ${formatCompactInr(kpis.gmv_this_period)} GMV. ${kpis.outstanding_count} still due and ${kpis.overdue_count} overdue.`;
  }, [lowerLabel, summaryData?.kpis]);

  if (isLoading && !data) return <InvoicesLandingSkeleton />;

  if (isError && !data) {
    return (
      <ErrorState
        heading="Couldn't load invoices"
        description="There was a problem fetching the invoices workboard. Please try again."
      />
    );
  }
  if (!data) return <InvoicesLandingSkeleton />;
  const showRefreshingState = isLoading && !data;
  const kpis = summaryData?.kpis;
  const groups: FilterBarGroup[] = (summaryData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof typeof filters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
    })),
  }));

  return (
    <PageWrap className="max-w-[1920px]">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        subtitle={subtitle}
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary={createInvoices ? 'Add an invoice' : undefined}
        onPrimaryClick={createInvoices ? () => router.push('/invoices/new') : undefined}
      />

      {showRefreshingState ? (
        <InvoicesDataSkeleton />
      ) : (
        <>
          <InsightStrip4
            tiles={[
              {
                label: 'Invoiced sales',
                value: formatCompactInr(kpis?.gmv_this_period ?? 0),
                sub: `${kpis?.invoices_this_period ?? 0} invoices this period`,
              },
              {
                label: 'Outstanding amount',
                value: formatCompactInr(kpis?.outstanding_sum ?? 0),
                sub: `${kpis?.outstanding_count ?? 0} invoice${(kpis?.outstanding_count ?? 0) === 1 ? '' : 's'} due`,
                tone: 'accent',
              },
              {
                label: 'Overdue amount',
                value: formatCompactInr(kpis?.overdue_sum ?? 0),
                sub: `${kpis?.overdue_count ?? 0} overdue invoice${(kpis?.overdue_count ?? 0) === 1 ? '' : 's'}`,
                tone: (kpis?.overdue_count ?? 0) > 0 ? 'warn' : undefined,
              },
              {
                label: 'Due in 7 days',
                value: `${summaryData?.todays_read?.needs_attention?.length ?? 0}`,
                sub: 'upcoming collections',
              },
            ]}
          />

          <V3CalloutPanel
            items={[
              {
                kind: 'risk',
                eyebrow: 'Largest overdue balances',
                hint: `${summaryData?.todays_read?.needs_attention?.length ?? 0}`,
                rows: (summaryData?.todays_read?.needs_attention ?? []).map((row) => ({
                  ...mapRowToCallout(row),
                  reason: invoiceSupportText(row),
                  trailing: formatCompactInr(row.outstanding_amount),
                })),
              },
              {
                kind: 'info',
                eyebrow: 'High-value invoices due soon',
                hint: `${summaryData?.todays_read?.top_spenders?.length ?? 0}`,
                rows: (summaryData?.todays_read?.top_spenders ?? []).map((row) => ({
                  ...mapRowToCallout(row),
                  reason: invoiceSupportText(row),
                  trailing: formatCompactInr(row.total_amount),
                })),
              },
              {
                kind: 'opportunity',
                eyebrow: 'Newly overdue invoices',
                hint: `${summaryData?.todays_read?.top_risers?.length ?? 0}`,
                rows: (summaryData?.todays_read?.top_risers ?? []).map((row) => {
                  const latestInvoice = latestInvoiceByBuyer.get(row.buyer_id);
                  return {
                    initials: row.buyer_initials,
                    hue: row.buyer_hue,
                    name: row.buyer_name,
                    reason: latestInvoice
                      ? invoiceSupportText(latestInvoice)
                      : `${buyerGeographyLabel(row)} · +${formatCompactInr(row.delta_gmv)} vs last period`,
                    trailing: formatCompactInr(row.current_gmv),
                  };
                }),
              },
            ]}
          />

            <FilterBar
              count={`${displayRows.length} of ${total} invoices${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
              searchPlaceholder="Search invoice number…"
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

          <div className="overflow-x-auto">
            {showTableSkeleton ? (
              <InvoicesDataSkeleton />
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
                showCampaignColumn={showCampaignColumn}
                tableMinWidth={showCampaignColumn ? 1480 : 1260}
                rows={displayRows.map((row) => ({
                  id: row.id,
                  href: `/invoices/${row.id}`,
                  document_number: row.invoice_number,
                  source_kind: row.source_kind,
                  source_label: row.source_label,
                  buyer_name: row.buyer_name,
                  buyer_place_of_supply: row.place_of_supply ?? buyerGeographyLabel(row),
                  buyer_initials: row.buyer_initials,
                  buyer_hue: row.buyer_hue,
                  location_name: row.location_name,
                  campaign_name: row.campaign_name,
                  items_count: row.items_count,
                  total_amount: row.total_amount,
                  amount_subtext: row.outstanding_amount > 0 ? `${formatInr(row.outstanding_amount)} due` : null,
                  status_label: row.status.label,
                  status_tone: row.status.tone,
                  created_at: row.created_at,
                  due_at: row.due_date,
                }))}
                onRowClick={(row) => router.push(row.href)}
              />
            )}
          </div>

          {/* Scroll sentinel — triggers next-page fetch when within 400px of viewport */}
          <div ref={sentinelRef} className="h-px" aria-hidden />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-8 w-48 rounded-full" />
            </div>
          )}
        </>
      )}
    </PageWrap>
  );
}

export function InvoicesLandingClient({
  initialData,
  initialPeriod,
  initialSearch,
}: {
  initialData: TenantInvoicesResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');

  if (orderManagement === false || invoicesFlag === false) {
    return <FeatureDisabledState />;
  }

  return <InvoicesLandingContent initialData={initialData} initialPeriod={initialPeriod} initialSearch={initialSearch} />;
}
