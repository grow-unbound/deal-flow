'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Send } from 'lucide-react';

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
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCompactInr } from '@/lib/utils';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import {
  useCustomersLanding,
  type CustomersLandingBuyer,
  type CustomersLandingResponse,
} from '@/hooks/useCustomersLanding';
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
  const { period, setPeriod, horizonLabel, lowerLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useCustomersLanding(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;
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
  useRouteScrollRestoration({
    storageKey: 'seller-customers-landing',
    scopeKey: period,
    ready: !isLoading,
  });
  const activeChip = routeState.activeChip;
  const sortBy = routeState.sortBy;
  const search = routeState.search;

  const buyers = landingData?.buyers ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buyers
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
  }, [buyers, activeChip, search, sortBy]);

  if (isLoading && !landingData) {
    return <CustomersLoadingSkeleton />;
  }
  if (!landingData) return <CustomersLoadingSkeleton />;
  const showRefreshingState = isLoading && !data;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Buyers"
        title="Customers"
        subtitle={`${landingData.kpis.total} retailers across ${landingData.kpis.cohort_count} cohorts. ${landingData.kpis.active} active ${lowerLabel}. The Tier-A names buy most of revenue, and dues cluster there too.`}
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
            value: `${landingData.kpis.active}/${landingData.kpis.total}`,
            sub: `${landingData.kpis.active_pct}% of base ordered`,
          },
          {
            label: `Spend · ${metricSuffix}`,
            value: formatCompactInr(landingData.kpis.spend_mtd),
            sub: `${landingData.kpis.spend_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(landingData.kpis.spend_growth_pct)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Dormant > 30d',
            value: String(landingData.kpis.dormant_over_30d),
            sub: "haven't ordered in a month",
            tone: 'warn',
          },
          {
            label: 'Outstanding dues',
            value: formatCompactInr(landingData.kpis.outstanding_dues),
            sub: `across ${landingData.kpis.buyers_with_dues} buyers`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs a call',
            hint: `${landingData.callouts.needs_call.length}`,
            rows: landingData.callouts.needs_call.map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason:
                buyer.dues > 0
                  ? `Last order ${buyer.last_order_label} · ${formatCompactInr(buyer.dues)} dues`
                  : `Last order ${buyer.last_order_label} · spend ${buyer.growth_pct}% MoM`,
              trailing: <GrowthPill value={buyer.growth_pct} />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top spenders',
            hint: 'by GMV',
            rows: landingData.callouts.top_spenders.map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: `${buyer.orders_mtd} orders · ${buyer.city}`,
              trailing: formatCompactInr(buyer.spend_mtd),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: landingData.callouts.top_risers.map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: `${buyer.city} · ${formatCompactInr(buyer.spend_mtd)} ${lowerLabel}`,
              trailing: <GrowthPill value={buyer.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`Showing ${filtered.length} of ${buyers.length}`}
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
        columns={[
          { label: 'Buyer', width: 320, className: 'px-5' },
          { label: 'Cohort', className: 'px-5' },
          { label: `Spend · ${metricSuffix}`, className: 'px-5' },
          { label: 'Growth', className: 'px-5' },
          { label: 'Orders', className: 'px-5' },
          { label: 'Last order', className: 'px-5' },
          { label: 'Credit', className: 'px-5' },
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
                    <p className="truncate text-[13.5px] font-medium text-cream-900">
                      {buyer.business_name}
                      {tier ? (
                        <span className="ml-2 rounded bg-ember-50 px-1.5 text-[10px] font-mono font-semibold text-ember-700">{tier}</span>
                      ) : null}
                    </p>
                    <p className="ent-sub mt-0.5 truncate text-[11px] uppercase tracking-[0.05em] text-cream-500">{buyer.city}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-[12.5px] text-cream-800">{buyer.cohort}</td>
              <td className="px-5 py-3.5"><span className="font-display text-[15px] font-medium tabular-nums text-cream-900">{formatCompactInr(buyer.spend_mtd)}</span></td>
              <td className="px-5 py-3.5"><GrowthPill value={buyer.growth_pct} /></td>
              <td className="px-5 py-3.5 font-mono text-[13px] tabular-nums text-cream-900">{buyer.orders_mtd}</td>
              <td className="px-5 py-3.5 font-mono text-[12px] text-cream-800">{formatDate(buyer.last_order_at)}</td>
              <td className="px-5 py-3.5">
                <div className="flex flex-col gap-1">
                  <div className="h-[5px] w-[140px] overflow-hidden rounded-full bg-cream-200">
                    <div
                      className={cn('h-[5px] rounded-full', creditRatio > 0.75 ? 'bg-warning-500' : 'bg-teal-500')}
                      style={{ width: `${Math.min(100, Math.round(creditRatio * 100))}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-cream-700">
                    {formatCompactInr(buyer.credit_used)} / {formatCompactInr(buyer.credit_limit)}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <StatusTag label={buyer.status.label} tone={buyer.status.tone} />
              </td>
              <td className="chev px-4 py-3.5 pr-4 text-right text-[16px] text-cream-500">›</td>
            </tr>
          );
        })}
      </LandingTable>

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
