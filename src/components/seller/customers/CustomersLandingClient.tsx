'use client';

import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { triggerHaptic } from '@/lib/haptics';
import { Users, MessageCircle, Smartphone } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import { AddCustomerDialog } from '@/components/seller/customers/AddCustomerDialog';
import { useFlag, useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import {
  FilterBar,
  type FilterBarGroup,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StickyListHeader,
  type InsightTile,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SplitPaneListRowsSkeleton, SplitPaneStickyHeaderSlot } from '@/components/seller/mobile';
import { cn, formatNumberValue } from '@/lib/utils';
import { joinSplitListMeta } from '@/lib/seller-split-list-ui';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSplitPaneOpen } from '@/hooks/useSplitPaneOpen';
import { useRouteScrollRestoration, useRouteSnapshot, useSeedRouteSearch } from '@/hooks/useRouteSnapshot';
import {
  useCustomersLandingInfinite,
  useCustomersLandingMetrics,
  type CustomersLandingTableRowV4,
  type CustomersLandingTableSort,
  type CustomersLandingMetricsV4,
} from '@/hooks/useCustomersLanding';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll, getSentinelInsertIndex } from '@/hooks/useInfiniteScroll';
import { SELLER_INFINITE_SCROLL_RATIO } from '@/lib/seller-ui';
import { LandingTableRowsSkeleton } from '@/components/seller/layout/LandingTableRowsSkeleton';
import type { CustomersLandingKpiCardV4 } from '@/lib/customers-landing-v4-types';
import {
  buildCustomersFilterPreset,
  chipsFromFilterPreset,
  chipsFromKpiId,
  EMPTY_CUSTOMERS_FILTER_CHIPS,
  kpiIdFromChips,
  type CustomersBuyerAppFilter,
  type CustomersLandingFilterChips,
  type CustomersOutstandingFilter,
  type CustomersStatusFilter,
} from '@/lib/customers-landing-filters';

type SortOption = 'Sales (high → low)' | 'Outstanding (high → low)' | 'Overdue (high → low)';

function sortOptionToApi(sortBy: SortOption): CustomersLandingTableSort {
  if (sortBy === 'Outstanding (high → low)') return 'receivable_amount';
  if (sortBy === 'Overdue (high → low)') return 'overdue_amount';
  return 'invoice_value';
}

function buildSortOptions(showInvoices: boolean): SortOption[] {
  return [
    ...(showInvoices ? (['Sales (high → low)'] as const) : []),
    'Outstanding (high → low)',
    'Overdue (high → low)',
  ];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'CU';
}

function formatKpiValue(card: CustomersLandingKpiCardV4): string {
  if (card.id === 'overdue_receivables') {
    return formatNumberValue(Number(card.value ?? 0), 'CURRENCY_THRESHOLD');
  }
  return formatNumberValue(Number(card.value ?? 0), 'COUNT');
}

function formatKpiSub(card: CustomersLandingKpiCardV4): string {
  const parts: string[] = [];
  if (card.supporting_text) parts.push(card.supporting_text);
  if (card.document_count != null) {
    parts.push(`${formatNumberValue(Number(card.document_count), 'COUNT')} invoices`);
  } else if (card.entity_count != null && card.id === 'overdue_receivables') {
    parts.push(`${formatNumberValue(Number(card.entity_count), 'COUNT')} customers`);
  }
  return parts.join(' · ') || '—';
}

/** Customer count for "Showing X of Y" when a KPI is selected — prefer entity_count (overdue is a ₹ value). */
function kpiListTotal(card: CustomersLandingKpiCardV4 | null): number | null {
  if (!card) return null;
  if (card.entity_count != null) return Number(card.entity_count);
  if (card.id === 'overdue_receivables') return null;
  return Number(card.value ?? 0);
}

function AmountCell({ amount }: { amount: number }) {
  return (
    <span className="font-display text-md font-normal tabular-nums text-cream-900">
      {formatNumberValue(amount, 'CURRENCY_THRESHOLD')}
    </span>
  );
}

function CountCell({ count }: { count: number }) {
  return (
    <span className="font-mono text-base tabular-nums text-cream-900">
      {formatNumberValue(count, 'COUNT')}
    </span>
  );
}

function CustomerBuyerAppAvatar({
  name,
  enabled,
  size = 38,
}: {
  name: string;
  enabled: boolean;
  size?: number;
}) {
  const label = enabled ? 'Buyer App enabled' : 'Buyer App disabled';
  if (enabled) {
    return (
      <div
        title={label}
        aria-label={label}
        className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-teal-200 bg-teal-100 text-teal-700"
        style={{ width: size, height: size }}
      >
        <Smartphone size={Math.max(14, Math.floor(size * 0.48))} strokeWidth={2} />
      </div>
    );
  }
  return (
    <div
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-dashed border-cream-400 bg-cream-100 font-display font-medium uppercase leading-none text-cream-500"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size * 0.34)) }}
    >
      {getInitials(name)}
    </div>
  );
}

function CustomerNameCell({
  name,
  phone,
  showBuyerApp,
  buyerAppEnabled,
}: {
  name: string;
  phone: string | null;
  showBuyerApp: boolean;
  buyerAppEnabled: boolean;
}) {
  const nameBlock = (
    <div className="min-w-0">
      <p className="truncate text-base font-medium text-cream-900">{name}</p>
      <p className="mt-0.5 truncate text-sm text-cream-700">
        {phone?.trim() || '—'}
      </p>
    </div>
  );

  if (!showBuyerApp) return nameBlock;

  return (
    <div className="ent flex items-center gap-3">
      <CustomerBuyerAppAvatar name={name} enabled={buyerAppEnabled} size={38} />
      {nameBlock}
    </div>
  );
}

function CustomersDataSkeleton({ columns = 12 }: { columns?: number }) {
  const tableMinWidth = 900 + Math.max(0, columns - 4) * 110;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-[14px]" />
      <LandingTableRowsSkeleton columns={columns} tableMinWidth={tableMinWidth} />
    </div>
  );
}

function CustomersLandingContent({
  initialMetrics,
}: {
  initialMetrics: CustomersLandingMetricsV4 | null;
}) {
  const router = useRouter();
  const { id: openId } = useParams<{ id?: string }>();
  const isPaneOpen = useSplitPaneOpen('/customers');
  const initialSearch = useSearchParams().get('search')?.trim() || undefined;
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const whatsappBroadcastEnabled = useFlag('WHATSAPP_BROADCAST');
  const estimatesFlag = useFlagState('ESTIMATES');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const invoicesFlag = useFlagState('INVOICES');
  const buyerAppFlag = useFlagState('BUYER_APP');
  const { data: tenantSettings } = useTenantSettings();
  const orderFeatures = tenantSettings?.modules.orders.features;
  const buyerAppModuleEnabled = tenantSettings?.modules.buyer_app.enabled;
  const modulesReady =
    orderFeatures != null &&
    buyerAppModuleEnabled !== undefined &&
    estimatesFlag !== undefined &&
    salesOrdersFlag !== undefined &&
    invoicesFlag !== undefined &&
    buyerAppFlag !== undefined;
  const showEstimates =
    modulesReady && estimatesFlag !== false && orderFeatures.enquiries !== false;
  const showOrders =
    modulesReady && salesOrdersFlag !== false && orderFeatures.sales_orders !== false;
  const showInvoices =
    modulesReady && invoicesFlag !== false && orderFeatures.invoices !== false;
  const showBuyerApp =
    modulesReady && buyerAppFlag !== false && buyerAppModuleEnabled !== false;
  // Keep the Buyer App chip mounted while modules load so it doesn't pop in after hydration.
  const showBuyerAppFilter = !modulesReady || showBuyerApp;
  const metricsQuery = useCustomersLandingMetrics(initialMetrics);
  const metricsData = useRetainedValue(metricsQuery.data ?? initialMetrics);
  const cards = metricsData?.cards ?? [];
  const sortOptions = useMemo(() => buildSortOptions(showInvoices), [showInvoices]);
  const qtdColumnCount =
    Number(showInvoices) * 2 +
    Number(showEstimates) * 2 +
    Number(showOrders) * 2 +
    Number(showBuyerApp) * 2;
  const tableColumnCount = 4 + qtdColumnCount;
  const tableMinWidth = 900 + qtdColumnCount * 110;

  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-customers-landing',
    scopeKey: 'this-quarter-v4',
    pathnameOverride: '/customers',
    version: 6,
    initialState: {
      filters: {
        ...EMPTY_CUSTOMERS_FILTER_CHIPS,
        filter_preset: null as Record<string, unknown> | null,
        selected_kpi_id: null as string | null,
      },
      sortBy: 'Sales (high → low)' as SortOption,
      search: '',
    },
  });
  useSeedRouteSearch({ initialSearch, setState: setRouteState });

  const filterChips: CustomersLandingFilterChips = {
    status: (routeState.filters?.status as CustomersStatusFilter[] | undefined) ?? [],
    outstanding: (routeState.filters?.outstanding as CustomersOutstandingFilter[] | undefined) ?? [],
    buyer_app: (routeState.filters?.buyer_app as CustomersBuyerAppFilter[] | undefined) ?? [],
  };
  const filterPreset = routeState.filters?.filter_preset ?? null;
  const selectedKpiId = routeState.filters?.selected_kpi_id ?? null;
  const sortBy = routeState.sortBy;
  const search = routeState.search;

  useEffect(() => {
    if (!modulesReady) return;
    if (sortBy === 'Sales (high → low)' && !showInvoices) {
      setRouteState((current) => ({
        ...current,
        sortBy: 'Outstanding (high → low)',
      }));
    }
  }, [modulesReady, setRouteState, showInvoices, sortBy]);

  const debouncedSearch = useDebounce(search, 300);
  const deferredPreset = useDeferredValue(filterPreset);
  // Sort must not be deferred — old V2 client re-sorted loaded rows instantly; deferring + keepPreviousData left the table stuck in the prior order.
  const isInterim =
    search !== debouncedSearch ||
    JSON.stringify(filterPreset) !== JSON.stringify(deferredPreset);

  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCustomersLandingInfinite({
      search: debouncedSearch,
      sort: sortOptionToApi(sortBy),
      filter_preset: deferredPreset,
    });

  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-customers-landing',
    scopeKey: 'this-quarter-v4',
    pathnameOverride: '/customers',
    ready: !isLoading,
  });

  const firstPage = data?.pages?.[0];
  const allBuyers = useMemo(
    () => data?.pages?.flatMap((p) => p.buyers) ?? [],
    [data?.pages],
  );

  // Instant visual sort on the loaded page (mirrors pre-V4 behavior) while the server page order catches up.
  const displayBuyers = useMemo(() => {
    const key = sortOptionToApi(sortBy);
    return [...allBuyers].sort((a, b) => {
      const delta = Number(b[key] ?? 0) - Number(a[key] ?? 0);
      if (delta !== 0) return delta;
      return a.id.localeCompare(b.id);
    });
  }, [allBuyers, sortBy]);

  const selectedCard = cards.find((card) => card.id === selectedKpiId) ?? null;
  const kpiTotal = selectedKpiId ? kpiListTotal(selectedCard) : null;
  // When a KPI is selected, Y = KPI count immediately. Otherwise prefer API total, else loaded length.
  const showingTotal =
    selectedKpiId && kpiTotal != null
      ? kpiTotal
      : (firstPage?.total ?? displayBuyers.length);

  const showTableSkeleton =
    !modulesReady ||
    ((isLoading || isFetching || isFetchingNextPage) && displayBuyers.length === 0);
  const sentinelIndex = useMemo(
    () => getSentinelInsertIndex(displayBuyers.length, SELLER_INFINITE_SCROLL_RATIO),
    [displayBuyers.length],
  );

  const showRefreshingState = metricsQuery.isLoading && !metricsData && isLoading && !data;
  const headerCard = selectedCard ?? cards[0] ?? null;

  function applyChips(
    nextChips: CustomersLandingFilterChips,
    options?: { selectedKpiId?: string | null; top80?: boolean },
  ) {
    const top80 = options?.top80 ?? false;
    const preset = buildCustomersFilterPreset(nextChips, { top80 });
    const nextKpiId =
      options?.selectedKpiId !== undefined
        ? options.selectedKpiId
        : kpiIdFromChips(nextChips, preset);
    setRouteState((current) => ({
      ...current,
      filters: {
        ...(current.filters ?? {}),
        ...nextChips,
        selected_kpi_id: nextKpiId,
        filter_preset: preset,
      },
      sortBy:
        top80 || preset?.cutoff === 'top80' || preset?.sort === 'invoice_value_desc'
          ? 'Sales (high → low)'
          : current.sortBy,
    }));
  }

  function handleKpiClick(card: CustomersLandingKpiCardV4) {
    const same = selectedKpiId === card.id;
    if (same) {
      applyChips(EMPTY_CUSTOMERS_FILTER_CHIPS, { selectedKpiId: null, top80: false });
      return;
    }
    const chips = chipsFromKpiId(card.id);
    applyChips(chips, {
      selectedKpiId: card.id,
      top80: card.id === 'top80_customers' || card.filter_preset?.cutoff === 'top80',
    });
  }

  function handleFilterGroupChange(
    key: keyof CustomersLandingFilterChips,
    values: string[],
  ) {
    const nextChips: CustomersLandingFilterChips = {
      ...filterChips,
      [key]: values,
    };
    applyChips(nextChips);
  }

  const groups: FilterBarGroup[] = useMemo(() => {
    const base: FilterBarGroup[] = [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'dormant', label: 'Dormant' },
          { value: 'inactive', label: 'Inactive' },
        ],
        values: filterChips.status,
        onChange: (values) => handleFilterGroupChange('status', values),
      },
      {
        key: 'outstanding',
        label: 'Outstanding',
        options: [
          { value: 'due', label: 'Due' },
          { value: 'overdue', label: 'Overdue' },
        ],
        values: filterChips.outstanding,
        onChange: (values) => handleFilterGroupChange('outstanding', values),
      },
    ];
    if (showBuyerAppFilter) {
      base.push({
        key: 'buyer_app',
        label: 'Buyer App',
        options: [
          { value: 'enabled', label: 'Enabled' },
          { value: 'disabled', label: 'Disabled' },
        ],
        values: filterChips.buyer_app,
        onChange: (values) => handleFilterGroupChange('buyer_app', values),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest chips via route state
  }, [filterChips.status, filterChips.outstanding, filterChips.buyer_app, showBuyerAppFilter]);

  // Drop a stale Buyer App chip once the module is confirmed off.
  useEffect(() => {
    if (!modulesReady || showBuyerApp) return;
    if (filterChips.buyer_app.length === 0) return;
    applyChips({ ...filterChips, buyer_app: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesReady, showBuyerApp]);

  // Hydrate chips from a restored filter_preset that has no chip arrays (older route snapshots).
  useEffect(() => {
    if (!filterPreset) return;
    if (filterChips.status.length || filterChips.outstanding.length || filterChips.buyer_app.length) return;
    const restored = chipsFromFilterPreset(filterPreset);
    if (!restored.status.length && !restored.outstanding.length && !restored.buyer_app.length) return;
    setRouteState((current) => ({
      ...current,
      filters: {
        ...(current.filters ?? {}),
        ...restored,
      },
    }));
  }, [filterPreset, filterChips.status.length, filterChips.outstanding.length, filterChips.buyer_app.length, setRouteState]);

  return (
    <PageWrap className="flex h-full min-h-0 flex-col">
      <StickyListHeader>
        <SplitPaneStickyHeaderSlot
          isPaneOpen={isPaneOpen}
          showRefreshingState={showRefreshingState}
          isError={isError || metricsQuery.isError}
        >
          <PageHeader
            eyebrow={isPaneOpen ? 'Customers' : 'Buyers'}
            title={isPaneOpen && headerCard ? headerCard.label : 'Customers'}
            subtitle={
              isPaneOpen && headerCard
                ? `${formatKpiValue(headerCard)} · ${formatKpiSub(headerCard)}`
                : 'This Quarter'
            }
            horizon="This Quarter"
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

          {isPaneOpen ? null : (
            <InsightStrip4
              tiles={cards.map((card): InsightTile => ({
                label: card.label,
                value: formatKpiValue(card),
                sub: formatKpiSub(card),
                onClick: () => handleKpiClick(card),
                selected: selectedKpiId === card.id,
              }))}
            />
          )}

          <FilterBar
            count={`Showing ${displayBuyers.length} of ${showingTotal}${(isFetching || isFetchingNextPage || isInterim) ? ' · Updating' : ''}`}
            searchPlaceholder="Search by customer name, phone number…"
            chips={[]}
            activeChip=""
            sortBy={sortBy}
            hideViewToggle
            compact={isPaneOpen}
            groups={groups}
            searchValue={search}
            onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
            sortOptions={sortOptions}
            onSortChange={(option) =>
              setRouteState((current) => ({ ...current, sortBy: option as SortOption }))
            }
          />
        </SplitPaneStickyHeaderSlot>
      </StickyListHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showRefreshingState ? (
          isPaneOpen ? (
            <SplitPaneListRowsSkeleton isPaneOpen />
          ) : (
            <CustomersDataSkeleton columns={tableColumnCount} />
          )
        ) : isError || metricsQuery.isError ? (
          <ErrorState
            heading="Couldn't load customers"
            description="There was a problem fetching your customers. Please try again."
          />
        ) : (
          <>
            {showTableSkeleton ? (
              isPaneOpen ? (
                <SplitPaneListRowsSkeleton isPaneOpen />
              ) : (
                <LandingTableRowsSkeleton
                  columns={modulesReady ? tableColumnCount : 12}
                  tableMinWidth={modulesReady ? tableMinWidth : 2200}
                />
              )
            ) : (
              <LandingTable
                showEmptyState={displayBuyers.length === 0 && !isLoading}
                emptyState={
                  <EmptyState
                    icon={<Users size={28} strokeWidth={1.5} />}
                    heading={
                      search.trim() || filterPreset
                        ? 'No matching customers'
                        : 'No customers yet'
                    }
                    description={
                      search.trim() || filterPreset
                        ? 'Try a different search or clear filters.'
                        : 'Add your first customer to start customer groups and pricing.'
                    }
                  />
                }
                columns={[
                  { label: 'Customer', width: '280px', minWidth: 240, maxWidth: 360, className: 'px-5' },
                  ...(showInvoices
                    ? [
                        { label: 'Sales · QTD', align: 'right' as const, minWidth: 120, maxWidth: 160, className: 'px-5' },
                        { label: 'Invoices', align: 'right' as const, minWidth: 90, maxWidth: 120, className: 'px-5' },
                      ]
                    : []),
                  ...(showEstimates
                    ? [
                        { label: 'Estimate Value · QTD', align: 'right' as const, minWidth: 140, maxWidth: 170, className: 'px-5' },
                        { label: 'Estimates', align: 'right' as const, minWidth: 90, maxWidth: 120, className: 'px-5' },
                      ]
                    : []),
                  ...(showOrders
                    ? [
                        { label: 'Order Value · QTD', align: 'right' as const, minWidth: 120, maxWidth: 160, className: 'px-5' },
                        { label: 'Orders', align: 'right' as const, minWidth: 90, maxWidth: 120, className: 'px-5' },
                      ]
                    : []),
                  ...(showBuyerApp
                    ? [
                        { label: 'App Demand · QTD', align: 'right' as const, minWidth: 130, maxWidth: 170, className: 'px-5' },
                        { label: 'App docs', align: 'right' as const, minWidth: 90, maxWidth: 120, className: 'px-5' },
                      ]
                    : []),
                  { label: 'Outstanding', align: 'right', minWidth: 120, maxWidth: 150, className: 'px-5' },
                  { label: 'Overdue', align: 'right', minWidth: 110, maxWidth: 140, className: 'px-5' },
                  { label: 'Credit Used', align: 'right', minWidth: 130, maxWidth: 160, className: 'px-5' },
                  { width: 40, className: 'px-4' },
                ]}
                tableMinWidth={tableMinWidth}
                forceCompact={isPaneOpen}
                sentinelIndex={sentinelIndex}
                sentinelRef={sentinelRef}
                mobileRows={displayBuyers.map((buyer: CustomersLandingTableRowV4) => ({
                  id: buyer.id,
                  href: `/customers/${buyer.id}`,
                  leading: showBuyerApp ? (
                    <CustomerBuyerAppAvatar
                      name={buyer.business_name}
                      enabled={buyer.buyer_app_enabled}
                      size={32}
                    />
                  ) : undefined,
                  eyebrow: showBuyerApp
                    ? buyer.buyer_app_enabled
                      ? 'App enabled'
                      : 'App off'
                    : undefined,
                  primary: buyer.business_name,
                  supporting: joinSplitListMeta(
                    buyer.phone?.trim() || null,
                    showInvoices
                      ? `${formatNumberValue(buyer.invoice_count, 'COUNT')} invoices QTD`
                      : showOrders
                        ? `${formatNumberValue(buyer.order_count, 'COUNT')} orders QTD`
                        : showEstimates
                          ? `${formatNumberValue(buyer.estimate_count, 'COUNT')} estimates QTD`
                          : showBuyerApp
                            ? `${formatNumberValue(buyer.app_demand_count, 'COUNT')} app docs QTD`
                            : null,
                    buyer.overdue_amount > 0
                      ? `Overdue ${formatNumberValue(buyer.overdue_amount, 'CURRENCY_THRESHOLD')}`
                      : null,
                  ),
                  trailing:
                    buyer.receivable_amount > 0
                      ? formatNumberValue(buyer.receivable_amount, 'CURRENCY_THRESHOLD')
                      : showInvoices
                        ? formatNumberValue(buyer.invoice_value, 'CURRENCY_THRESHOLD')
                        : showOrders
                          ? formatNumberValue(buyer.order_value, 'CURRENCY_THRESHOLD')
                          : showEstimates
                            ? formatNumberValue(buyer.estimate_value, 'CURRENCY_THRESHOLD')
                            : showBuyerApp
                              ? formatNumberValue(buyer.app_demand_value, 'CURRENCY_THRESHOLD')
                              : formatNumberValue(buyer.credit_used, 'CURRENCY_THRESHOLD'),
                  selected: buyer.id === openId,
                }))}
              >
                {displayBuyers.map((buyer: CustomersLandingTableRowV4, index) => {
                  const creditRatio =
                    buyer.credit_limit > 0 ? buyer.credit_used / buyer.credit_limit : 0;
                  const colSpan = tableColumnCount + 1;
                  return (
                    <Fragment key={buyer.id}>
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
                          buyer.id === openId ? 'bg-ember-50' : 'bg-white',
                        )}
                        onClick={() => router.push(`/customers/${buyer.id}`)}
                        onPointerDown={() => triggerHaptic()}
                      >
                        <td className="px-3 py-3 text-base text-cream-900">
                          <CustomerNameCell
                            name={buyer.business_name}
                            phone={buyer.phone}
                            showBuyerApp={showBuyerApp}
                            buyerAppEnabled={buyer.buyer_app_enabled}
                          />
                        </td>
                        {showInvoices ? (
                          <>
                            <td className="px-3 py-3 text-right">
                              <AmountCell amount={buyer.invoice_value} />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <CountCell count={buyer.invoice_count} />
                            </td>
                          </>
                        ) : null}
                        {showEstimates ? (
                          <>
                            <td className="px-3 py-3 text-right">
                              <AmountCell amount={buyer.estimate_value} />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <CountCell count={buyer.estimate_count} />
                            </td>
                          </>
                        ) : null}
                        {showOrders ? (
                          <>
                            <td className="px-3 py-3 text-right">
                              <AmountCell amount={buyer.order_value} />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <CountCell count={buyer.order_count} />
                            </td>
                          </>
                        ) : null}
                        {showBuyerApp ? (
                          <>
                            <td className="px-3 py-3 text-right">
                              <AmountCell amount={buyer.app_demand_value} />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <CountCell count={buyer.app_demand_count} />
                            </td>
                          </>
                        ) : null}
                        <td className="px-3 py-3 text-right text-base text-cream-900">
                          <span className="font-display text-md font-normal tabular-nums text-cream-900">
                            {formatNumberValue(buyer.receivable_amount, 'CURRENCY_THRESHOLD')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-base text-cream-900">
                          <span className="font-display text-md font-normal tabular-nums text-cream-900">
                            {buyer.overdue_amount > 0
                              ? formatNumberValue(buyer.overdue_amount, 'CURRENCY_THRESHOLD')
                              : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="ml-auto flex w-[120px] flex-col items-end gap-1">
                            <div className="h-[5px] w-full overflow-hidden rounded-full bg-cream-200">
                              <div
                                className={cn(
                                  'h-[5px] rounded-full',
                                  creditRatio > 0.75 ? 'bg-warning-500' : 'bg-teal-500',
                                )}
                                style={{ width: `${Math.min(100, Math.round(creditRatio * 100))}%` }}
                              />
                            </div>
                            <span className="text-xs text-cream-700">
                              <span className="tabular-inline">
                                {formatNumberValue(buyer.credit_used, 'CURRENCY_EXACT')}
                              </span>{' '}
                              /{' '}
                              <span className="tabular-inline">
                                {formatNumberValue(buyer.credit_limit, 'CURRENCY_EXACT')}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="chev px-3 py-3 pr-4 text-right text-md text-cream-500">›</td>
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
          <AddCustomerDialog open={addBuyerOpen} onOpenChange={setAddBuyerOpen} />
        ) : null}
      </div>
    </PageWrap>
  );
}

export function CustomersLandingClient({
  initialData,
}: {
  initialData: CustomersLandingMetricsV4 | null;
}) {
  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <CustomersLandingContent initialMetrics={initialData} />
    </FeatureGate>
  );
}
