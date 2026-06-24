'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Send, Plus, Users } from 'lucide-react';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  FilterBar,
  GrowthPill,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCompactInr } from '@/lib/utils';
import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import {
  useCustomersLandingInfinite,
  type CustomersLandingBuyer,
  type CustomersLandingResponse,
} from '@/hooks/useCustomersLanding';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import type { SellerLandingPeriod } from '@/lib/seller-period';

const InviteUserDialog = dynamic(
  () => import('@/components/seller/InviteUserDialog').then((m) => m.InviteUserDialog),
  { ssr: false },
);

const AddCustomerDialog = dynamic(
  () => import('@/components/seller/customers/AddCustomerDialog').then((m) => m.AddCustomerDialog),
  { ssr: false },
);

type SortOption = 'Spend (high → low)' | 'Spend (low → high)' | 'Growth (high → low)' | 'Recent activity';
type Chip = 'All tiers' | 'Tier A' | 'Tier B' | 'Dormant' | 'Has dues';

const SORT_OPTIONS: SortOption[] = ['Spend (high → low)', 'Spend (low → high)', 'Growth (high → low)', 'Recent activity'];
const CHIPS: Chip[] = ['All tiers', 'Tier A', 'Tier B', 'Dormant', 'Has dues'];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function tabularInline(value: string): ReactNode {
  return <span className="tabular-inline">{value}</span>;
}

function CustomersLoadingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-4 w-[38rem]" />
          <div className="flex justify-end gap-2">
            <Skeleton className="h-9 w-28 rounded-[8px]" />
            <Skeleton className="h-9 w-32 rounded-[8px]" />
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
  initialPeriod,
}: {
  initialData: CustomersLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { creditEnabled } = useBusinessPolicy();
  const { period, setPeriod, horizonLabel, lowerLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { state: routeState, setState: setRouteState } = useRouteSnapshot({
    storageKey: 'seller-customers-landing',
    scopeKey: period,
    initialState: {
      activeChip: 'All tiers' as Chip,
      sortBy: 'Spend (high → low)' as SortOption,
      search: '',
    },
  });
  const activeChip = routeState.activeChip;
  const sortBy = routeState.sortBy;
  const search = routeState.search;

  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useCustomersLandingInfinite(
    period,
    { search: debouncedSearch },
  );
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    rootMargin: '400px',
    onLoadMore: fetchNextPage,
  });
  useRouteScrollRestoration({
    storageKey: 'seller-customers-landing',
    scopeKey: period,
    ready: !isLoading,
  });

  const firstPage = data?.pages[0];
  const allBuyers = useMemo(() => data?.pages.flatMap((p) => p.buyers) ?? [], [data?.pages]);
  const total = (firstPage as { total?: number | null } | undefined)?.total ?? firstPage?.kpis?.total ?? allBuyers.length;

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return allBuyers
      .filter((buyer) => {
        if (activeChip === 'Tier A') return buyer.tier === 'A';
        if (activeChip === 'Tier B') return buyer.tier === 'B';
        if (activeChip === 'Dormant') return buyer.status.label === 'Dormant';
        if (activeChip === 'Has dues') return buyer.dues > 0;
        return true;
      })
      .filter((buyer) => {
        if (!q) return true;
        return (
          buyer.business_name.toLowerCase().includes(q) ||
          buyer.city.toLowerCase().includes(q) ||
          buyer.cohort.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'Spend (high → low)') return b.spend_mtd - a.spend_mtd;
        if (sortBy === 'Spend (low → high)') return a.spend_mtd - b.spend_mtd;
        if (sortBy === 'Growth (high → low)') return b.growth_pct - a.growth_pct;
        const aDate = a.last_order_at ? Date.parse(a.last_order_at) : 0;
        const bDate = b.last_order_at ? Date.parse(b.last_order_at) : 0;
        return bDate - aDate;
      });
  }, [allBuyers, activeChip, debouncedSearch, sortBy]);

  if (isLoading && !data) {
    return <CustomersLoadingSkeleton />;
  }
  if (!data) return <CustomersLoadingSkeleton />;
  const showRefreshingState = isLoading && !data;
  const kpis = firstPage?.kpis;
  const callouts = firstPage?.callouts;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Buyers"
        title="Customers"
        subtitle={`${kpis?.total} retailers across ${kpis?.cohort_count} customer groups. ${kpis?.active} active ${lowerLabel}. The Tier-A names buy most of revenue, and dues cluster there too.`}
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        secondary={{ label: 'Invite buyer', icon: <Send size={13} />, onClick: () => setInviteOpen(true) }}
        primary="Add a customer"
        onPrimaryClick={() => setAddOpen(true)}
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
            label: 'Active buyers',
            value: `${kpis?.active}/${kpis?.total}`,
            sub: `${kpis?.active_pct}% of base ordered`,
          },
          {
            label: `Spend · ${metricSuffix}`,
            value: formatCompactInr(kpis?.spend_mtd ?? 0),
            sub: `${(kpis?.spend_growth_pct ?? 0) >= 0 ? '↑ +' : '↓ '}${Math.abs(kpis?.spend_growth_pct ?? 0)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Dormant > 30d',
            value: String(kpis?.dormant_over_30d),
            sub: "haven't ordered in a month",
            tone: 'warn',
          },
          {
            label: 'Outstanding dues',
            value: formatCompactInr(kpis?.outstanding_dues ?? 0),
            sub: `across ${kpis?.buyers_with_dues} buyers`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs a call',
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
            eyebrow: 'Top spenders',
            hint: 'by GMV',
            rows: (callouts?.top_spenders ?? []).map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: `${buyer.orders_mtd} orders · ${buyer.city}`,
              trailing: <span className="font-mono text-base tabular">{formatCompactInr(buyer.spend_mtd)}</span>,
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
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
        count={`Showing ${filtered.length} of ${total}`}
        searchPlaceholder="Search buyer, city, GSTIN…"
        chips={CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={(value) => setRouteState((current) => ({ ...current, search: value }))}
        onChipChange={(chip) => setRouteState((current) => ({ ...current, activeChip: chip as Chip }))}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setRouteState((current) => ({ ...current, sortBy: option as SortOption }))}
      />
        </>
      )}

      <LandingTable
        showEmptyState={filtered.length === 0}
        emptyState={
          <EmptyState
            icon={<Users size={28} strokeWidth={1.5} />}
            heading={search.trim() || activeChip !== 'All tiers' ? 'No matching customers' : 'No customers yet'}
            description={
              search.trim() || activeChip !== 'All tiers'
                ? 'Try a different search or tier filter.'
                : 'Add your first customer to start customer groups and pricing.'
            }
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus size={13} />
                Add a customer
              </Button>
            }
          />
        }
        columns={[
          { label: 'Buyer', width: 320, className: 'px-5' },
          { label: 'Customer group', className: 'px-5' },
          { label: `Spend · ${metricSuffix}`, className: 'px-5' },
          { label: 'Growth', className: 'px-5' },
          { label: 'Orders', className: 'px-5' },
          { label: 'Last order', className: 'px-5' },
          ...(creditEnabled ? [{ label: 'Credit', className: 'px-5' }] : []),
          { label: 'Status', className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
      >
        {filtered.map((buyer: CustomersLandingBuyer) => {
          const creditRatio = buyer.credit_limit > 0 ? buyer.credit_used / buyer.credit_limit : 0;
          const tier = buyer.tier ? `Tier ${buyer.tier}` : null;
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
                    <p className="truncate text-base font-medium text-cream-900">
                      {buyer.business_name}
                      {tier ? (
                        <span className="ml-2 rounded bg-ember-50 px-1.5 text-xs font-medium uppercase tracking-[0.06em] text-ember-700">{tier}</span>
                      ) : null}
                    </p>
                    <p className="ent-sub mt-0.5 truncate text-xs uppercase tracking-[0.05em] text-cream-500">{buyer.city}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-cream-800">{buyer.cohort}</td>
              <td className="px-5 py-3.5"><span className="font-display text-md font-medium tabular-nums text-cream-900">{formatCompactInr(buyer.spend_mtd)}</span></td>
              <td className="px-5 py-3.5"><GrowthPill value={buyer.growth_pct} /></td>
              <td className="px-5 py-3.5 font-mono text-base tabular-nums text-cream-900">{buyer.orders_mtd}</td>
              <td className="px-5 py-3.5 text-sm text-cream-800"><span className="tabular-inline">{formatDate(buyer.last_order_at)}</span></td>
              {creditEnabled ? (
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
              ) : null}
              <td className="px-5 py-3.5">
                <StatusTag label={buyer.status.label} tone={buyer.status.tone} />
              </td>
              <td className="chev px-4 py-3.5 pr-4 text-right text-md text-cream-500">›</td>
            </tr>
          );
        })}
      </LandingTable>

      {/* Scroll sentinel — triggers next-page fetch 400px before list end */}
      <div ref={sentinelRef} className="h-px" aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
    </PageWrap>
  );
}

export function CustomersLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: CustomersLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <CustomersLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
