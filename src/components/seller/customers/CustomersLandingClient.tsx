'use client';

import type { ReactNode } from 'react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, MessageCircle } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { AddCustomerDialog } from '@/components/seller/customers/AddCustomerDialog';
import { useFlag } from '@/hooks/useFeatureFlag';
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
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCompactInr } from '@/lib/utils';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import {
  useCustomersLandingInfinite,
  useCustomersLanding,
  type CustomersLandingBuyer,
  type CustomersLandingResponse,
} from '@/hooks/useCustomersLanding';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { CustomersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';

type SortOption = 'Sales (high → low)' | 'Sales (low → high)' | 'Trend (high → low)' | 'Recent activity';
const SORT_OPTIONS: SortOption[] = ['Sales (high → low)', 'Sales (low → high)', 'Trend (high → low)', 'Recent activity'];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function tabularInline(value: string): ReactNode {
  return <span className="tabular-inline">{value}</span>;
}

function matchesBuyerSearch(buyer: CustomersLandingBuyer, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    buyer.business_name,
    buyer.phone,
    buyer.city,
    buyer.state ?? null,
    buyer.cohort,
    buyer.active_price_list?.name ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function CustomersLoadingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-4 w-[38rem]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-[8px]" />
            <Skeleton className="h-9 w-32 rounded-[8px]" />
          </div>
        </div>

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

        <div className="space-y-2">
          <Skeleton className="h-14 rounded-[14px]" />
          <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
            <div className="border-b border-cream-200 p-3">
              <div className="grid grid-cols-[340px_180px_220px_130px_120px_150px_130px_130px_160px_40px] gap-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={`head-${i}`} className="h-3 w-full" />
                ))}
              </div>
            </div>
            <div className="p-3">
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, rowIndex) => (
                  <div key={`row-${rowIndex}`} className="grid grid-cols-[340px_180px_220px_130px_120px_150px_130px_130px_160px_40px] gap-3">
                    {Array.from({ length: 9 }).map((_, colIndex) => (
                      <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-10 rounded-md" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

function CustomersDataSkeleton() {
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
      <div className="space-y-2">
        <Skeleton className="h-14 rounded-[14px]" />
        <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-200 p-3">
            <div className="grid grid-cols-[320px_repeat(7,minmax(0,1fr))_40px] gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={`head-${i}`} className="h-3 w-full" />
              ))}
            </div>
          </div>
          <div className="p-3">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <div key={`row-${rowIndex}`} className="grid grid-cols-[320px_repeat(7,minmax(0,1fr))_40px] gap-3">
                  {Array.from({ length: 9 }).map((_, colIndex) => (
                    <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-10 rounded-md" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomersLandingContent({
  initialData,
  initialSearch,
}: {
  initialData: CustomersLandingResponse | null;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const whatsappBroadcastEnabled = useFlag('WHATSAPP_BROADCAST');
  const horizonLabel = 'Trailing 90 days';
  const lowerLabel = 'in the last 90 days';
  const metricSuffix = '90D';
  const summaryQuery = useCustomersLanding('month', initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-customers-landing',
    scopeKey: 'fixed-90d',
    version: 4,
    initialState: {
      filters: {
        status: [] as string[],
        due: [] as string[],
      },
      sortBy: 'Sales (high → low)' as SortOption,
      search: '',
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });
  const filters = routeState.filters ?? { status: [], due: [] };
  const sortBy = routeState.sortBy;
  const search = routeState.search;

  const debouncedSearch = useDebounce(search, 300);
  const deferredFilters = useDeferredValue(filters);
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filters) !== JSON.stringify(deferredFilters);
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useCustomersLandingInfinite(
    'month',
    { search: debouncedSearch, ...deferredFilters },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-customers-landing',
    scopeKey: 'fixed-90d',
    ready: !isLoading,
  });

  const firstPage = data?.pages?.[0];
  const allBuyers = useMemo(() => data?.pages?.flatMap((p) => p.buyers) ?? [], [data?.pages]);
  const filteredTotal = (firstPage as { total?: number | null } | undefined)?.total ?? firstPage?.kpis?.total ?? allBuyers.length;

  const filtered = useMemo(() => {
    const locallyFiltered = allBuyers.filter((buyer) => {
      if (!matchesBuyerSearch(buyer, search)) {
        return false;
      }

      return true;
    });

    return [...locallyFiltered].sort((a, b) => {
        if (sortBy === 'Sales (high → low)') return b.spend_mtd - a.spend_mtd;
        if (sortBy === 'Sales (low → high)') return a.spend_mtd - b.spend_mtd;
        if (sortBy === 'Trend (high → low)') return b.growth_pct - a.growth_pct;
        const aDate = a.last_order_at ? Date.parse(a.last_order_at) : 0;
        const bDate = b.last_order_at ? Date.parse(b.last_order_at) : 0;
        return bDate - aDate;
      });
  }, [allBuyers, search, sortBy]);
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filtered.length === 0;

  if (isLoading && !data) {
    return <CustomersLandingSkeleton />;
  }
  if (!data) return <CustomersLandingSkeleton />;
  const showRefreshingState = isLoading && !data;
  const kpis = summaryData?.kpis;
  const callouts = summaryData?.callouts;
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
    <PageWrap>
      <PageHeader
        eyebrow="Buyers"
        title="Customers"
        subtitle={`${kpis?.active ?? 0} active customers · ${kpis?.cohort_count ?? 0} groups configured.`}
        horizon={horizonLabel}
        secondary={
          whatsappBroadcastEnabled
            ? {
                label: 'Manage Broadcasts',
                icon: <MessageCircle size={13} />,
                onClick: () => router.push('/customers/broadcasts'),
              }
            : undefined
        }
        primary="Add a Buyer"
        onPrimaryClick={() => setAddBuyerOpen(true)}
      />

      {showRefreshingState ? (
        <CustomersDataSkeleton />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load customers"
          description="There was a problem fetching your customers. Please try again."
        />
      ) : (
        <>
      <InsightStrip4
        tiles={[
          {
            label: 'Customers who purchased',
            value: `${kpis?.active ?? 0}`,
            sub: `${kpis?.active_pct ?? 0}% of active customers`,
          },
          {
            label: `Invoiced sales · ${metricSuffix}`,
            value: formatCompactInr(kpis?.spend_mtd ?? 0),
            sub: `${(kpis?.spend_growth_pct ?? 0) >= 0 ? '↑ +' : '↓ '}${Math.abs(kpis?.spend_growth_pct ?? 0)}% vs prior period`,
            tone: 'accent',
          },
          {
            label: 'Inactive 90D',
            value: String(kpis?.dormant_over_30d),
            sub: 'no recent billed sale',
            tone: 'warn',
          },
          {
            label: 'Overdue amount',
            value: formatCompactInr(kpis?.outstanding_dues ?? 0),
            sub: `across ${kpis?.buyers_with_dues ?? 0} customers`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Collect overdue balances',
            hint: `${callouts?.needs_call.length}`,
            rows: (callouts?.needs_call ?? []).map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason:
                buyer.dues > 0
                  ? <>Last order {tabularInline(buyer.last_order_label)} · {tabularInline(formatCompactInr(buyer.dues))} dues</>
                  : <>Last order {tabularInline(buyer.last_order_label)} · spend {tabularInline(`${buyer.growth_pct}%`)} MoM</>,
              trailing: <GrowthPill value={buyer.growth_pct} />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Customers who purchased',
            hint: 'highest sales',
            rows: (callouts?.top_spenders ?? []).map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: `${buyer.orders_mtd} invoices · ${buyer.city}`,
              trailing: <span className="font-mono text-base tabular">{formatCompactInr(buyer.spend_mtd)}</span>,
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Win back candidates',
            hint: 'recent value',
            rows: (callouts?.top_risers ?? []).map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: <>{buyer.city} · {tabularInline(formatCompactInr(buyer.spend_mtd))} {lowerLabel}</>,
              trailing: <GrowthPill value={buyer.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`Showing ${filtered.length} of ${filteredTotal}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
        searchPlaceholder="Search buyer, city, GSTIN…"
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
        </>
      )}

      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={10} tableMinWidth={1760} />
      ) : (
      <LandingTable
        showEmptyState={filtered.length === 0 && !isLoading}
        emptyState={
          <EmptyState
            icon={<Users size={28} strokeWidth={1.5} />}
            heading={search.trim() || groups.some((group) => group.values.length > 0) ? 'No matching customers' : 'No customers yet'}
            description={
              search.trim() || groups.some((group) => group.values.length > 0)
                ? 'Try a different search or filter combination.'
                : 'Add your first customer to start customer groups and pricing.'
            }
          />
        }
        columns={[
          { label: 'Customer', width: '400px', minWidth: 340, maxWidth: 420, className: 'px-5' },
          { label: 'Customer Group', minWidth: 180, maxWidth: 240, className: 'px-5' },
          { label: 'Pricing setup', minWidth: 220, maxWidth: 280, className: 'px-5' },
          { label: `Invoiced sales · ${metricSuffix}`, align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
          { label: 'Trend', minWidth: 120, maxWidth: 140, className: 'px-5' },
          { label: 'Overdue amount', align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
          { label: 'Last sale', minWidth: 130, maxWidth: 150, className: 'px-5' },
          { label: 'Credit Used', align: 'right', minWidth: 130, maxWidth: 170, className: 'px-5' },
          { label: 'Status', minWidth: 160, maxWidth: 200, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1540}
        >
          {filtered.map((buyer: CustomersLandingBuyer) => {
          const creditRatio = buyer.credit_limit > 0 ? buyer.credit_used / buyer.credit_limit : 0;
          const priceListLabel = buyer.active_price_list?.name ?? 'No price list';
          const priceListSubtext =
            buyer.active_price_list?.source === 'direct'
              ? 'Direct to buyer'
              : buyer.active_price_list?.cohort_name
                ? `Through ${buyer.active_price_list.cohort_name}`
                : '';
          return (
            <tr
              key={buyer.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/customers/${buyer.id}`)}
            >
              <td className="px-5 py-3.5">
                <div className="ent flex items-center gap-3">
                  <EntityAvatar initials={buyer.avatar.initials} hue={buyer.avatar.hue} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{buyer.business_name}</p>
                    <p className="ent-sub mt-0.5 truncate text-xs uppercase tracking-[0.05em] text-cream-500">
                      {buyer.phone ? `${buyer.phone}` : ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-cream-800">
                <div className="min-w-0">
                  <p className="truncate text-sm text-cream-900">{buyer.cohort}</p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm text-cream-900">{priceListLabel}</p>
                  <p className="mt-1 truncate text-xs text-cream-500">{priceListSubtext}</p>
                </div>
              </td>
              <td className="px-5 py-3.5 text-right">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">{formatCompactInr(buyer.spend_mtd)}</span>
              </td>
              <td className="px-5 py-3.5"><GrowthPill value={buyer.growth_pct} /></td>
              <td className="px-5 py-3.5 text-right text-sm text-cream-800"><span className="tabular-inline">{formatCompactInr(buyer.dues)}</span></td>
              <td className="px-5 py-3.5 text-sm text-cream-800"><span className="tabular-inline">{formatDate(buyer.last_order_at)}</span></td>
              <td className="px-5 py-3.5">
                <div className="flex flex-col gap-1">
                  <div className="h-[5px] w-[140px] overflow-hidden rounded-full bg-cream-200">
                    <div
                      className={cn('h-[5px] rounded-full', creditRatio > 0.75 ? 'bg-warning-500' : 'bg-teal-500')}
                      style={{ width: `${Math.min(100, Math.round(creditRatio * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs text-cream-700">
                    <span className="tabular-inline">{formatCompactInr(buyer.credit_used)}</span> / <span className="tabular-inline">{formatCompactInr(buyer.credit_limit)}</span>
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusTag label={buyer.status.label} tone={buyer.status.tone} />
                  {buyer.whatsapp_opted_out ? (
                    <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs font-medium text-cream-700">
                      WhatsApp: opted out
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
            </tr>
          );
          })}
      </LandingTable>
      )}

      {/* Scroll sentinel — triggers next-page fetch 400px before list end */}
      <div ref={sentinelRef} className="h-px" aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>
      )}

      {addBuyerOpen ? (
        <AddCustomerDialog
          open={addBuyerOpen}
          onOpenChange={setAddBuyerOpen}
        />
      ) : null}
    </PageWrap>
  );
}

export function CustomersLandingClient({
  initialData,
  initialSearch,
}: {
  initialData: CustomersLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
  initialSearch?: string;
}) {
  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <CustomersLandingContent initialData={initialData} initialSearch={initialSearch} />
    </FeatureGate>
  );
}
