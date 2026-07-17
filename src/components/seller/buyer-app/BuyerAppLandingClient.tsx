'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { DetailCardRenderer, PerformanceCard, RankedList } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import {
  useBuyerAppLanding,
  type BuyerAppLandingResponse,
  type BuyerAppCalloutBuyer,
} from '@/hooks/useBuyerApp';
import { formatCompactInr, formatInr } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { BuyerAppSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

function BuyerAppLandingContent({
  initialData,
  initialPeriod,
}: {
  initialData: BuyerAppLandingResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const period = initialPeriod;
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { data, isLoading, isError } = useBuyerAppLanding(period, initialData);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;

  if (isLoading && !landingData) return <BuyerAppSkeleton />;

  if (isError && !landingData) {
    return (
      <ErrorState
        heading="Couldn't load buyer app data"
        description="There was a problem fetching buyer app analytics. Please try again."
      />
    );
  }

  if (!landingData) return <BuyerAppSkeleton />;

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
        subtitle="Track how much of your business flows through the buyer app and who's driving it."
        horizon={horizonLabel}
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
        <DetailCardRenderer
          card={{
            id: 'buyer-app-adoption',
            representation: 'distribution',
            title: 'Adoption funnel',
            subtitle: 'This month',
            body: {
              items: [
                { id: 'enabled', label: 'Enabled', value: snap.enabled_buyers, pct: 100, supporting: `${snap.enabled_buyers} buyers can use the app` },
                { id: 'opened', label: 'Opened app', value: snap.opened_app_mtd, pct: snap.enabled_buyers > 0 ? Math.round((snap.opened_app_mtd / snap.enabled_buyers) * 100) : 0 },
                { id: 'ordered', label: 'Ordered', value: snap.ordered_mtd, pct: snap.enabled_buyers > 0 ? Math.round((snap.ordered_mtd / snap.enabled_buyers) * 100) : 0 },
                { id: 'repeat', label: 'Repeat (2+ orders)', value: snap.repeat_mtd, pct: snap.enabled_buyers > 0 ? Math.round((snap.repeat_mtd / snap.enabled_buyers) * 100) : 0 },
              ],
              emptyTitle: 'No enabled buyers yet',
              emptyDescription: 'Adoption will appear once buyers are enabled for the app.',
            },
          }}
        />
        <DetailCardRenderer
          card={{
            id: 'buyer-app-business-through-app',
            representation: 'distribution',
            title: 'Business through app',
            subtitle: 'This month',
            body: {
              items: [
                {
                  id: 'estimates',
                  label: 'Estimates (app-sourced)',
                  value: formatCompactInr(snap.estimates_app_value_mtd),
                  pct: snap.total_gmv_mtd > 0 ? Math.round((snap.estimates_app_value_mtd / snap.total_gmv_mtd) * 100) : 0,
                  supporting: `${snap.estimates_app_count_mtd} ${snap.estimates_app_count_mtd === 1 ? 'estimate' : 'estimates'}`,
                },
                {
                  id: 'converted',
                  label: 'Converted to order',
                  value: formatCompactInr(snap.converted_order_value_mtd),
                  pct: snap.estimates_app_value_mtd > 0 ? Math.round((snap.converted_order_value_mtd / snap.estimates_app_value_mtd) * 100) : 0,
                  supporting: `${snap.converted_order_count_mtd} orders`,
                },
                {
                  id: 'invoiced',
                  label: 'Invoiced',
                  value: formatCompactInr(snap.invoiced_app_value_mtd),
                  pct: snap.total_gmv_mtd > 0 ? Math.round((snap.invoiced_app_value_mtd / snap.total_gmv_mtd) * 100) : 0,
                  supporting: `${snap.invoiced_app_count_mtd} invoices · ${snap.total_gmv_mtd > 0 ? Math.round((snap.app_gmv_mtd / snap.total_gmv_mtd) * 100) : 0}% of total GMV`,
                },
              ],
              emptyTitle: 'No app-sourced business yet',
              emptyDescription: 'Commercial flow through the buyer app will appear here.',
            },
          }}
        />
        <PerformanceCard
          title="Top buyers on app"
          subtitle="By GMV this month"
          actions={(
            <Link href="/customers?filter=app_active" className="text-sm font-semibold text-teal-700 no-underline">
              View all
            </Link>
          )}
          bodyClassName="p-0"
        >
          <RankedList
            items={snap.top_app_buyers_card.map((buyer) => ({
              id: buyer.buyer_id,
              label: buyer.name,
              meta: buyer.city,
              value: formatCompactInr(buyer.gmv),
              supporting: `${buyer.orders} order${buyer.orders !== 1 ? 's' : ''}`,
              initials: buyer.initials,
            }))}
            emptyTitle="No app orders yet this month"
            emptyDescription="Top buyers will appear once the app starts generating orders."
          />
        </PerformanceCard>
        <DetailCardRenderer
          card={{
            id: 'buyer-app-location-usage',
            representation: 'mix',
            title: 'Usage by location',
            subtitle: 'Buyer app orders and GMV share',
            body: {
              items: snap.top_locations.map((location) => ({
                id: location.location_id,
                label: location.name,
                value: location.app_gmv > 0 ? formatCompactInr(location.app_gmv) : '—',
                pct: location.share_pct,
                supporting: `${location.app_orders} order${location.app_orders !== 1 ? 's' : ''}`,
              })),
              emptyTitle: 'No location usage yet',
              emptyDescription: 'Location-level buyer app activity will show here once orders are placed.',
              mode: 'mix',
            },
          }}
        />
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
