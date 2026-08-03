'use client';

import { Fragment, useDeferredValue, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { Users, MessageCircle } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { AddCustomerDialog } from '@/components/seller/customers/AddCustomerDialog';
import { useFlag } from '@/hooks/useFeatureFlag';
import {
  EntityAvatar,
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
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SellerMobileListSkeleton } from '@/components/seller/mobile';
import { cn, formatNumberValue } from '@/lib/utils';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import {
  useCustomersLandingInfinite,
  useCustomersLanding,
  type CustomersLandingBuyer,
  type CustomersLandingResponse,
} from '@/hooks/useCustomersLanding';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { CustomersLandingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';

type SortOption = 'Recent activity' | 'Sales (high → low)' | 'Outstanding (high → low)';
const SORT_OPTIONS: SortOption[] = ['Recent activity', 'Sales (high → low)', 'Outstanding (high → low)'];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatOverdueDays(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value}d overdue`;
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

function CustomersDataSkeleton({ isPaneOpen }: { isPaneOpen?: boolean }) {
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
}: {
  initialData: CustomersLandingResponse | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = openId != null;
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>('active-customers');
  const whatsappBroadcastEnabled = useFlag('WHATSAPP_BROADCAST');
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const summaryQuery = useCustomersLanding('last90', initialData);
  const summaryData = useRetainedValue(summaryQuery.data ?? initialData);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-customers-landing',
    scopeKey: 'fixed-90d',
    pathnameOverride: '/customers',
    version: 4,
    initialState: {
      filters: {
        status: [] as string[],
        due: [] as string[],
      },
      sortBy: 'Recent activity' as SortOption,
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
    'last90',
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
    pathnameOverride: '/customers',
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
        if (sortBy === 'Outstanding (high → low)') return b.dues - a.dues;
        const aDate = a.last_order_at ? Date.parse(a.last_order_at) : 0;
        const bDate = b.last_order_at ? Date.parse(b.last_order_at) : 0;
        return bDate - aDate;
      });
  }, [allBuyers, search, sortBy]);
  const showTableSkeleton = (isLoading || isFetching || isFetchingNextPage) && filtered.length === 0;
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(filtered.length, SELLER_INFINITE_SCROLL_RATIO),
    [filtered.length],
  );

  const showRefreshingState = isLoading && !data;
  const kpis = summaryData?.kpis;
  const groups: FilterBarGroup[] =(summaryData?.filters?.groups ?? []).map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options,
    values: filters[group.key as keyof typeof filters] ?? [],
    onChange: (values) => setRouteState((current) => ({
      ...current,
      filters: { ...(current.filters ?? filters), [group.key]: values },
    })),
  }));

  const kpiOptions = [
    {
      id: 'active-customers',
      label: 'Active Customers · Last 90 Days',
      value: `${kpis?.active ?? 0}`,
      sub: `${kpis?.active_pct ?? 0}% purchased at least once`,
    },
    {
      id: 'invoiced-sales',
      label: `Invoiced sales · ${metricSuffix}`,
      value: formatNumberValue(kpis?.spend_mtd ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${kpis?.invoiced_customer_count ?? 0} customers`,
    },
    {
      id: 'inactive-customers',
      label: 'Inactive customers last 90 days',
      value: String(kpis?.dormant_over_30d ?? 0),
      sub: `${formatNumberValue(kpis?.dormant_prior_year_value ?? 0, 'CURRENCY_THRESHOLD')} previous sales`,
    },
    {
      id: 'overdue-amount',
      label: 'Overdue amount',
      value: formatNumberValue(kpis?.overdue_sum ?? 0, 'CURRENCY_THRESHOLD'),
      sub: `${kpis?.overdue_customer_count ?? 0} customers`,
    },
  ];
  const selectedOption = kpiOptions.find((option) => option.id === selectedKpiKey) ?? kpiOptions[0];

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <PageHeader
          eyebrow={isPaneOpen ? 'Customers' : 'Buyers'}
          title={isPaneOpen ? selectedOption.label : 'Customers'}
          subtitle={isPaneOpen
            ? `${selectedOption.value} · ${selectedOption.sub}`
            : `${kpis?.active ?? 0} of ${kpis?.total ?? 0} customers in last 90 days`}
          horizon={horizonLabel}
          showHorizonControl={false}
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
              count={`Showing ${filtered.length} of ${filteredTotal}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
              searchPlaceholder="Search buyer, city, GSTIN…"
              chips={[]}
              activeChip=""
              sortBy={sortBy}
              hideViewToggle
              compact={isPaneOpen}
              groups={groups}
              searchValue={search}
              onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
              sortOptions={SORT_OPTIONS}
              onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
            />
          </>
        )}
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {showRefreshingState ? (
        <CustomersDataSkeleton isPaneOpen={isPaneOpen} />
      ) : isError ? (
        <ErrorState
          heading="Couldn't load customers"
          description="There was a problem fetching your customers. Please try again."
        />
      ) : (
        <>
      {showTableSkeleton ? (
        <LandingTableRowsSkeleton columns={10} tableMinWidth={1760} forceCompact={isPaneOpen} />
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
          { label: 'Customer', width: '360px', minWidth: 340, maxWidth: 420, className: 'px-5' },
          { label: 'Customer Group', minWidth: 180, maxWidth: 240, className: 'px-5' },
          { label: 'Price List', minWidth: 220, maxWidth: 280, className: 'px-5' },
          { label: `Sales · ${metricSuffix}`, align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
          { label: 'Outstanding Due', align: 'right', minWidth: 150, maxWidth: 180, className: 'px-5' },
          { label: 'Overdue', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
          { label: 'Last sale', minWidth: 130, maxWidth: 150, className: 'px-5' },
          { label: 'Credit Used', align: 'right', minWidth: 116, maxWidth: 144, className: 'px-5' },
          { label: 'Status', minWidth: 190, maxWidth: 240, className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
        tableMinWidth={1640}
        forceCompact={isPaneOpen}
        sentinelIndex={sentinelIndex}
        sentinelRef={sentinelRef}
        mobileRows={filtered.map((buyer: CustomersLandingBuyer) => ({
          id: buyer.id,
          href: `/customers/${buyer.id}`,
          primary: buyer.business_name,
          supporting: `${buyer.phone || 'No phone'} · ${buyer.cohort}`,
          meta: `Last sale ${formatDate(buyer.last_order_at)}`,
          trailing: buyer.dues > 0
            ? formatNumberValue(buyer.dues, 'CURRENCY_THRESHOLD')
            : formatNumberValue(buyer.spend_mtd, 'CURRENCY_THRESHOLD'),
          selected: buyer.id === openId,
        }))}
        >
          {filtered.map((buyer: CustomersLandingBuyer, index) => {
          const creditRatio = buyer.credit_limit > 0 ? buyer.credit_used / buyer.credit_limit : 0;
          const priceListLabel = buyer.active_price_list?.name ?? 'No price list';
          const priceListSubtext =
            buyer.active_price_list?.source === 'direct'
              ? 'Direct to buyer'
              : buyer.active_price_list?.cohort_name
                ? `Through ${buyer.active_price_list.cohort_name}`
                : '';
          return (
            <Fragment key={buyer.id}>
            {index === sentinelIndex ? (
              <tr aria-hidden="true" style={{ height: 0 }}>
                <td colSpan={10} className="p-0"><div ref={sentinelRef} /></td>
              </tr>
            ) : null}
            <tr
              className={cn(
                'cursor-pointer border-b border-cream-300 transition-colors duration-fast hover:bg-cream-50 active:bg-cream-100',
                buyer.id === openId ? 'bg-ember-50' : 'bg-white',
              )}
              onClick={() => router.push(`/customers/${buyer.id}`)}
              onPointerDown={() => triggerHaptic()}
            >
              <td className="px-3 py-2">
                <div className="ent flex items-center gap-3">
                  {/* <EntityAvatar initials={buyer.avatar.initials} hue={buyer.avatar.hue} size={38} /> */}
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{buyer.business_name}</p>
                    <p className="ent-sub mt-0.5 truncate text-xs uppercase tracking-[0.05em] text-cream-500">
                      {buyer.phone ? `${buyer.phone}` : ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-cream-800">
                <div className="min-w-0">
                  <p className="truncate text-sm text-cream-900">{buyer.cohort}</p>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm text-cream-900">{priceListLabel}</p>
                  <p className="mt-1 truncate text-xs text-cream-500">{priceListSubtext}</p>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                <span className="font-display text-md font-medium tabular-nums text-cream-900">{formatNumberValue(buyer.spend_mtd, 'CURRENCY_THRESHOLD')}</span>
              </td>
              <td className="px-3 py-2 text-right text-md font-medium tabular-nums text-cream-800">
                <span className="tabular-inline">{formatNumberValue(buyer.dues, 'CURRENCY_THRESHOLD')}</span>
              </td>
              <td className="px-3 py-2 text-right text-sm text-cream-800">
                <div className="flex flex-col items-end">
                  <span className="tabular-inline font-display text-md font-medium tabular-nums text-cream-900 tabular-inline">
                    {buyer.overdue_amount && buyer.overdue_amount > 0 ? formatNumberValue(buyer.overdue_amount, 'CURRENCY_THRESHOLD') : '-'}
                  </span>
                  {buyer.overdue_amount && buyer.overdue_amount > 0 ? <span className="mt-1 text-xs text-cream-500">{formatOverdueDays(buyer.overdue_days)}</span> : null}
                </div>
              </td>
              <td className="px-3 py-2 text-sm text-cream-800"><span className="tabular-inline">{formatDate(buyer.last_order_at)}</span></td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  <div className="h-[5px] w-[120px] overflow-hidden rounded-full bg-cream-200">
                    <div
                      className={cn('h-[5px] rounded-full', creditRatio > 0.75 ? 'bg-warning-500' : 'bg-teal-500')}
                      style={{ width: `${Math.min(100, Math.round(creditRatio * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs text-cream-700">
                    <span className="tabular-inline">{formatNumberValue(buyer.credit_used, 'CURRENCY_EXACT')}</span> / <span className="tabular-inline">{formatNumberValue(buyer.credit_limit, 'CURRENCY_EXACT')}</span>
                  </span>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusTag label={buyer.status.label} tone={buyer.status.tone} className="whitespace-nowrap" />
                  {buyer.whatsapp_opted_out ? (
                    <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs font-medium text-cream-700">
                      WhatsApp: opted out
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="chev px-3 py-2 pr-4 text-right text-md text-cream-500">›</td>
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
        </>
      )}

      {addBuyerOpen ? (
        <AddCustomerDialog
          open={addBuyerOpen}
          onOpenChange={setAddBuyerOpen}
        />
      ) : null}
      </div>
    </PageWrap>
  );
}

export function CustomersLandingClient({
  initialData,
}: {
  initialData: CustomersLandingResponse | null;
}) {
  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <CustomersLandingContent initialData={initialData} />
    </FeatureGate>
  );
}
