'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  EntityAvatar,
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { DashboardCard } from '@/components/seller/DashboardStats';
import { ErrorState } from '@/components/ui/empty-state';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import {
  useBuyerAppLanding,
  type BuyerAppLandingResponse,
  type BuyerAppCalloutBuyer,
  type BuyerAppTopBuyer,
  type BuyerAppLocation,
} from '@/hooks/useBuyerApp';
import { formatCompactInr, formatInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';

function BuyerAppLoadingSkeleton() {
  return (
    <PageWrap>
      <div className="h-24 animate-pulse rounded-[12px] bg-cream-100 border border-cream-200" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[260px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </PageWrap>
  );
}

function FunnelRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-cream-600">{label}</span>
        <span className="text-[13px] font-semibold text-cream-950 font-mono">
          {count} <span className="text-[11px] font-normal text-cream-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-cream-200">
        <div
          className="h-1.5 rounded-full bg-teal-500 transition-all"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

function GmvFunnelRow({
  label,
  value,
  count,
  note,
}: {
  label: string;
  value: number;
  count: number;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-cream-100 last:border-0">
      <div>
        <p className="text-[12px] text-cream-600">{label}</p>
        {note && <p className="text-[11px] text-cream-400 mt-0.5">{note}</p>}
      </div>
      <div className="text-right">
        <p className="text-[15px] font-semibold text-cream-950">{formatCompactInr(value)}</p>
        <p className="text-[11px] text-cream-400">{count} {count === 1 ? 'item' : 'items'}</p>
      </div>
    </div>
  );
}

function AdoptionFunnelCard({ snap }: { snap: NonNullable<BuyerAppLandingResponse['snapshot']> }) {
  const total = snap.enabled_buyers;
  return (
    <DashboardCard title="Adoption funnel" subtitle="This month">
      <FunnelRow label="Enabled" count={snap.enabled_buyers} total={total} />
      <FunnelRow label="Opened app" count={snap.opened_app_mtd} total={total} />
      <FunnelRow label="Ordered" count={snap.ordered_mtd} total={total} />
      <FunnelRow label="Repeat (2+ orders)" count={snap.repeat_mtd} total={total} />
    </DashboardCard>
  );
}

function GmvContributionCard({ snap }: { snap: NonNullable<BuyerAppLandingResponse['snapshot']> }) {
  const gmvSharePct =
    snap.total_gmv_mtd > 0
      ? Math.round((snap.app_gmv_mtd / snap.total_gmv_mtd) * 100)
      : 0;
  const convRate =
    snap.estimates_app_value_mtd > 0
      ? Math.round((snap.converted_order_value_mtd / snap.estimates_app_value_mtd) * 100)
      : 0;

  return (
    <DashboardCard title="Business through app" subtitle="This month">
      <GmvFunnelRow
        label="Estimates (app-sourced)"
        value={snap.estimates_app_value_mtd}
        count={snap.estimates_app_count_mtd}
      />
      <GmvFunnelRow
        label="Converted to order"
        value={snap.converted_order_value_mtd}
        count={snap.converted_order_count_mtd}
        note={`${convRate}% of estimates`}
      />
      <GmvFunnelRow
        label="Invoiced"
        value={snap.invoiced_app_value_mtd}
        count={snap.invoiced_app_count_mtd}
      />
      <p className="mt-3 text-[11px] text-cream-500">
        App share of total GMV:{' '}
        <span className="font-semibold text-cream-800">{gmvSharePct}%</span>
      </p>
    </DashboardCard>
  );
}

function TopBuyersCard({ buyers }: { buyers: BuyerAppTopBuyer[] }) {
  return (
    <DashboardCard title="Top buyers on app" subtitle="by GMV this month">
      {buyers.length === 0 ? (
        <p className="text-[12px] text-cream-400">No app orders yet this month.</p>
      ) : (
        <div className="space-y-3">
          {buyers.map((b) => (
            <div key={b.buyer_id} className="flex items-center gap-3">
              <EntityAvatar initials={b.initials} hue="teal" size={34} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-cream-950 truncate">{b.name}</p>
                {b.city && <p className="text-[11px] text-cream-400">{b.city}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-semibold text-cream-950">{formatCompactInr(b.gmv)}</p>
                <p className="text-[11px] text-cream-400">{b.orders} order{b.orders !== 1 ? 's' : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link
        href="/customers?filter=app_active"
        className="mt-4 block text-[12px] text-teal-600 hover:text-teal-700 font-medium"
      >
        View all →
      </Link>
    </DashboardCard>
  );
}

function LocationUsageCard({ locations }: { locations: BuyerAppLocation[] }) {
  return (
    <DashboardCard title="Usage by location" subtitle="buyer app orders & GMV">
      {locations.length === 0 ? (
        <p className="text-[12px] text-cream-400">No app orders by location yet.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-cream-400 text-left">
              <th className="pb-2 font-medium">Location</th>
              <th className="pb-2 font-medium text-right">Orders</th>
              <th className="pb-2 font-medium text-right">App GMV</th>
              <th className="pb-2 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.location_id} className="border-t border-cream-100">
                <td className="py-2 text-cream-900 truncate max-w-[120px]">{loc.name}</td>
                <td className="py-2 text-right font-mono text-cream-700">
                  {loc.app_orders > 0 ? loc.app_orders : '—'}
                </td>
                <td className="py-2 text-right font-mono text-cream-900 font-medium">
                  {loc.app_gmv > 0 ? formatCompactInr(loc.app_gmv) : '—'}
                </td>
                <td className="py-2 text-right text-cream-500">
                  {loc.share_pct != null ? `${loc.share_pct}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  );
}

function BuyerAppLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: BuyerAppLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const { period, setPeriod, horizonLabel, metricSuffix, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useBuyerAppLanding(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;

  if (isLoading && !landingData) return <BuyerAppLoadingSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load buyer app data"
        description="There was a problem fetching buyer app analytics. Please try again."
      />
    );
  }

  if (!landingData) return <BuyerAppLoadingSkeleton />;

  const kpis = landingData.kpis;
  const snap = landingData.snapshot ?? {
    enabled_buyers: 0, total_buyers: 0, opened_app_mtd: 0, ordered_mtd: 0, repeat_mtd: 0,
    app_gmv_mtd: 0, app_orders_mtd: 0, total_gmv_mtd: 0,
    estimates_app_value_mtd: 0, estimates_app_count_mtd: 0,
    converted_order_value_mtd: 0, converted_order_count_mtd: 0,
    invoiced_app_value_mtd: 0, invoiced_app_count_mtd: 0,
    not_ordering_buyers: [], top_app_buyers_callout: [], no_app_buyers: [],
    top_app_buyers_card: [], top_locations: [], refreshed_at: '',
  };

  const enabledPct =
    kpis.total_buyers > 0 ? Math.round((kpis.enabled_buyers / kpis.total_buyers) * 100) : 0;
  const gmvSharePct =
    snap && snap.total_gmv_mtd > 0
      ? Math.round((snap.app_gmv_mtd / snap.total_gmv_mtd) * 100)
      : 0;
  const avgOrdersPerUser =
    kpis.enabled_buyers > 0 ? (kpis.app_orders / kpis.enabled_buyers).toFixed(1) : '0';
  const avgOrderValue =
    kpis.app_orders > 0 ? Math.round(kpis.app_gmv / kpis.app_orders) : 0;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Engagement"
        title="Buyer App"
        subtitle="Track how much of your business flows through the buyer portal and who's driving it."
        horizon={horizonLabel}
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
        primary="Manage Access"
        onPrimaryClick={() => router.push('/buyer-app/access')}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'App-enabled buyers',
            value: `${kpis.enabled_buyers}`,
            sub: `${enabledPct}% of your buyer base`,
          },
          {
            label: `App GMV · ${metricSuffix}`,
            value: formatCompactInr(kpis.app_gmv),
            sub: `${kpis.app_orders} orders · ${gmvSharePct}% of total GMV`,
            tone: 'accent',
          },
          {
            label: 'Active this month',
            value: `${snap?.ordered_mtd ?? kpis.active_buyers}`,
            sub: `${snap?.repeat_mtd ?? 0} placed 2+ orders`,
          },
          {
            label: 'Avg orders / user',
            value: `${avgOrdersPerUser}`,
            sub: `avg ${formatInr(avgOrderValue)} per order`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Enabled, not ordering',
            hint: `${(snap?.not_ordering_buyers ?? []).length} buyers`,
            rows: (snap?.not_ordering_buyers ?? []).map((b: BuyerAppCalloutBuyer) => ({
              initials: b.initials,
              hue: 'ember' as const,
              name: b.name,
              reason: `Enabled ${b.enabled_date ?? '—'} · ${b.days_inactive ?? 0}d since last app order`,
              trailing: <StatusTag label="Inactive" tone="warning" />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top app buyers',
            hint: 'by GMV',
            rows: (snap?.top_app_buyers_callout ?? []).map((b: BuyerAppCalloutBuyer) => ({
              initials: b.initials,
              hue: 'teal' as const,
              name: b.name,
              reason: `${b.orders ?? 0} orders via app`,
              trailing: formatCompactInr(b.gmv ?? 0),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Not yet on app',
            hint: 'highest offline spend',
            rows: (snap?.no_app_buyers ?? []).map((b: BuyerAppCalloutBuyer) => ({
              initials: b.initials,
              hue: 'cream' as const,
              name: b.name,
              reason: `${formatCompactInr(b.offline_gmv ?? 0)} offline spend`,
              trailing: (
                <Link
                  href={`/customers/${b.buyer_id}`}
                  className="text-[12px] text-teal-600 hover:text-teal-700 font-medium whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  Enable →
                </Link>
              ),
            })),
          },
        ]}
        stalenessHint={snap.refreshed_at ? `Updated ${new Date(snap.refreshed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : undefined}
      />

      <div className="buyer-app-cards mt-6 grid grid-cols-2 gap-6">
        <AdoptionFunnelCard snap={snap} />
        <GmvContributionCard snap={snap} />
        <TopBuyersCard buyers={snap.top_app_buyers_card} />
        <LocationUsageCard locations={snap.top_locations} />
      </div>
    </PageWrap>
  );
}

export function BuyerAppLandingClient({
  initialData,
  initialPeriod,
}: {
  initialData: BuyerAppLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BUYER_APP">
      <BuyerAppLandingContent initialData={initialData} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
