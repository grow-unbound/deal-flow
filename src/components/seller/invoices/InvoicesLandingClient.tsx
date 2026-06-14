'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantInvoices, type TenantInvoicesResponse } from '@/hooks/useInvoices';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { formatCompactInr, formatDate, formatInr } from '@/lib/utils';
import { sellerLandingMetricSuffix, type SellerLandingPeriod } from '@/lib/seller-period';

type SortOption = 'Recent first';
type FilterChip = 'All' | 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Void';

const FILTER_CHIPS: FilterChip[] = ['All', 'Draft', 'Sent', 'Paid', 'Overdue', 'Void'];
const SORT_OPTIONS: SortOption[] = ['Recent first'];

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
}: {
  initialData: TenantInvoicesResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, lowerLabel, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useTenantInvoices(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
  const metricSuffix = sellerLandingMetricSuffix(period);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-invoices-landing',
    scopeKey: period,
    version: 2,
    initialState: {
      search: '',
      activeChip: 'All' as FilterChip,
      sortBy: 'Recent first' as SortOption,
    },
  });
  useRouteScrollRestoration({
    storageKey: 'seller-invoices-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const search = routeState.search;
  const activeChip = routeState.activeChip;
  const sortBy = routeState.sortBy;

  const invoices = landingData?.invoices ?? [];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byChip = invoices.filter((row) => {
      if (activeChip === 'All') return true;
      return row.status.filter_chip === activeChip;
    });
    const bySearch = byChip.filter((row) => {
      if (!query) return true;
      return (
        row.invoice_number.toLowerCase().includes(query) ||
        row.buyer_name.toLowerCase().includes(query) ||
        buyerGeographyLabel(row).toLowerCase().includes(query) ||
        row.source_label.toLowerCase().includes(query) ||
        row.source_detail.toLowerCase().includes(query)
      );
    });
    return bySearch.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeChip, invoices, search, sortBy]);

  const subtitle = useMemo(() => {
    const kpis = landingData?.kpis;
    if (!kpis) {
      return `Track receivables and collections ${lowerLabel}.`;
    }
    return `${kpis.invoices_this_period} invoices ${lowerLabel} with ${formatCompactInr(kpis.gmv_this_period)} GMV. ${kpis.outstanding_count} still due and ${kpis.overdue_count} overdue.`;
  }, [landingData?.kpis, lowerLabel]);

  if (isLoading && !landingData) return <InvoicesLoadingSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load invoices"
        description="There was a problem fetching the invoices workboard. Please try again."
      />
    );
  }
  if (!landingData) return <InvoicesLoadingSkeleton />;
  const showRefreshingState = isLoading && !data;
  const kpis = landingData.kpis;

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
        primary="Add an invoice"
        onPrimaryClick={() => router.push('/invoices/new')}
      />

      {showRefreshingState ? (
        <InvoicesDataSkeleton />
      ) : (
        <>
          <InsightStrip4
            tiles={[
              {
                label: `Invoices · ${metricSuffix}`,
                value: `${kpis.invoices_this_period}`,
                sub: `${kpis.invoices_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(kpis.invoices_growth_pct)}% vs last period`,
              },
              {
                label: 'GMV',
                value: formatCompactInr(kpis.gmv_this_period),
                sub: `AOV ${formatCompactInr(kpis.aov)}`,
                tone: 'accent',
              },
              {
                label: 'Outstanding',
                value: formatCompactInr(kpis.outstanding_sum),
                sub: `${kpis.outstanding_count} invoice${kpis.outstanding_count === 1 ? '' : 's'} due`,
              },
              {
                label: 'Overdue',
                value: formatCompactInr(kpis.overdue_sum),
                sub: `${kpis.overdue_count} invoice${kpis.overdue_count === 1 ? '' : 's'} overdue`,
                tone: kpis.overdue_count > 0 ? 'warn' : undefined,
              },
            ]}
          />

          <V3CalloutPanel
            items={[
              {
                kind: 'risk',
                eyebrow: 'Needs Attention',
                hint: `${landingData.todays_read.needs_attention.length}`,
                rows: landingData.todays_read.needs_attention.map((row) => ({
                  ...mapRowToCallout(row),
                  reason: `${row.invoice_number} · Due ${row.due_date ? formatDate(row.due_date) : '—'}`,
                  trailing: (
                    <span className="inline-flex font-sans">
                      <StatusTag label={row.effective === 'overdue' ? 'Overdue' : 'Sent'} tone={row.effective === 'overdue' ? 'danger' : 'warning'} />
                    </span>
                  ),
                })),
              },
              {
                kind: 'info',
                eyebrow: 'Top Spenders',
                hint: `${landingData.todays_read.top_spenders.length}`,
                rows: landingData.todays_read.top_spenders.map((row) => ({
                  ...mapRowToCallout(row),
                  reason: `${row.invoice_number} · ${row.items_count} items`,
                  trailing: formatCompactInr(row.total_amount),
                })),
              },
              {
                kind: 'opportunity',
                eyebrow: 'Top Risers',
                hint: `${landingData.todays_read.top_risers.length}`,
                rows: landingData.todays_read.top_risers.map((row) => ({
                  initials: row.buyer_initials,
                  hue: row.buyer_hue,
                  name: row.buyer_name,
                  reason: `${buyerGeographyLabel(row)} · +${formatCompactInr(row.delta_gmv)} vs last period`,
                  trailing: formatCompactInr(row.current_gmv),
                })),
              },
            ]}
          />

          <FilterBar
            count={`Showing ${filteredRows.length} of ${invoices.length}`}
            searchPlaceholder="Search invoice number, buyer, geography…"
            chips={FILTER_CHIPS}
            activeChip={activeChip}
            sortBy={sortBy}
            hideViewToggle
            searchValue={search}
            onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
            onChipChange={(chip) => setRouteState((current) => ({ ...current, activeChip: chip as FilterChip }))}
            sortOptions={SORT_OPTIONS}
            onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
          />

          <LandingTable
            showEmptyState={filteredRows.length === 0}
            emptyState={
              <EmptyState
                icon={<Receipt size={28} strokeWidth={1.5} />}
                heading={search.trim() || activeChip !== 'All' ? 'No matching invoices' : 'No invoices yet'}
                description={
                  search.trim() || activeChip !== 'All'
                    ? 'Try a different search or status filter.'
                    : 'Create an invoice to bill a buyer.'
                }
                action={
                  <Button variant="accent" asChild>
                    <Link href="/invoices/new" className="inline-flex items-center gap-1.5">
                      <Plus size={13} />
                      Add an invoice
                    </Link>
                  </Button>
                }
              />
            }
            tableClassName="v2-table"
            columns={[
              { label: 'Invoice #', width: 140, className: 'px-5' },
              { label: 'Buyer', width: 240, className: 'px-5' },
              { label: 'Source', className: 'px-5' },
              { label: 'Items', align: 'right', className: 'px-5' },
              { label: 'Value', align: 'right', className: 'px-5' },
              { label: 'Status', className: 'px-5' },
              { label: 'Created', className: 'px-5' },
              { label: 'Due', className: 'px-5' },
              { width: 40, className: 'px-4' },
            ]}
          >
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
                onClick={() => router.push(`/invoices/${row.id}`)}
              >
                <td className="px-5 py-3.5 font-mono text-sm text-cream-800">{row.invoice_number}</td>
                <td className="px-5 py-3.5 text-base text-cream-900">
                  <div className="ent flex items-center gap-3">
                    <EntityAvatar initials={row.buyer_initials} hue={row.buyer_hue} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-cream-900">{row.buyer_name}</p>
                      <p className="mt-0.5 truncate text-xs text-cream-600">{buyerGeographyLabel(row)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <p className="truncate text-sm text-cream-900">{row.source_label}</p>
                  <p className="mt-0.5 truncate text-xs text-cream-600">{row.source_detail}</p>
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{row.items_count}</td>
                <td className="num num-display px-5 py-3.5 text-right text-cream-900">
                  <p className="font-mono text-sm text-cream-900">{formatInr(row.total_amount)}</p>
                  {row.outstanding_amount > 0 ? <p className="mt-0.5 text-xs text-cream-600">{formatInr(row.outstanding_amount)} due</p> : null}
                </td>
                <td className="px-5 py-3.5">
                  <StatusTag label={row.status.label} tone={row.status.tone} />
                </td>
                <td className="px-5 py-3.5 font-mono text-sm text-cream-700">{formatDate(row.created_at)}</td>
                <td className="px-5 py-3.5 font-mono text-sm text-cream-700">
                  {row.due_date ? formatDate(row.due_date) : '—'}
                </td>
                <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
              </tr>
            ))}
          </LandingTable>
        </>
      )}
    </PageWrap>
  );
}

export function InvoicesLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: TenantInvoicesResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');

  if (orderManagement === false || invoicesFlag === false) {
    return <FeatureDisabledState />;
  }

  return <InvoicesLandingContent initialData={initialData} initialPeriod={initialPeriod} />;
}
