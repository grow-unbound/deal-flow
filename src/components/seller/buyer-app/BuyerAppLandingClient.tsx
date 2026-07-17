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
import { formatCompactInr } from '@/lib/utils';
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
  const demandSharePct =
    snap && snap.total_gmv_mtd > 0
      ? Math.round((snap.app_gmv_mtd / snap.total_gmv_mtd) * 100)
      : 0;
  const invoicedShareOfDemandPct =
    snap && snap.app_gmv_mtd > 0
      ? Math.round((snap.invoiced_app_value_mtd / snap.app_gmv_mtd) * 100)
      : 0;
  const primaryDemandKind = landingData.portfolio?.primary_demand_kind ?? 'orders';
  const primaryDemandNoun = primaryDemandKind === 'estimates' ? 'enquiries' : 'orders';
  const primaryDemandVerb = primaryDemandKind === 'estimates' ? 'submitted' : 'placed';

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Engagement"
        title="Buyer App"
        subtitle={`${kpis.enabled_buyers} customers can self-serve · track business submitted through Buyer App.`}
        horizon={horizonLabel}
        primary="Manage Access"
        onPrimaryClick={() => router.push('/buyer-app/access')}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Customers with Buyer App access',
            value: `${kpis.enabled_buyers}`,
            sub: `${enabledPct}% of your customer base`,
          },
          {
            label: `Customers submitting app demand · ${metricSuffix}`,
            value: `${snap?.ordered_mtd ?? kpis.active_buyers}`,
            sub: `${demandSharePct}% of submitted demand came through the app`,
            tone: 'accent',
          },
          {
            label: `App-sourced invoiced sales · ${metricSuffix}`,
            value: formatCompactInr(snap?.invoiced_app_value_mtd ?? kpis.invoiced_value),
            sub: `${invoicedShareOfDemandPct}% of app demand has invoiced through`,
          },
          {
            label: 'Repeat app customers',
            value: `${snap?.repeat_mtd ?? 0}`,
            sub: `${primaryDemandVerb} 2+ ${primaryDemandNoun}`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Access enabled, never used',
            hint: `${(snap?.not_ordering_buyers ?? []).length} customers`,
            rows: (snap?.not_ordering_buyers ?? []).map((b: BuyerAppCalloutBuyer) => ({
              initials: b.initials,
              hue: 'ember' as const,
              name: b.name,
              reason: `Access enabled ${b.enabled_date ?? '—'} · no app activity yet`,
              trailing: <StatusTag label="Inactive" tone="warning" />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top app contributors',
            hint: 'by invoiced sales',
            rows: (snap?.top_app_buyers_callout ?? []).map((b: BuyerAppCalloutBuyer) => ({
              initials: b.initials,
              hue: 'teal' as const,
              name: b.name,
              reason: 'Highest current app contribution',
              trailing: formatCompactInr(b.gmv ?? 0),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Valuable customers without app access',
            hint: 'highest assisted sales',
            rows: (snap?.no_app_buyers ?? []).map((b: BuyerAppCalloutBuyer) => ({
              initials: b.initials,
              hue: 'cream' as const,
              name: b.name,
              reason: `${formatCompactInr(b.offline_gmv ?? 0)} invoiced sales outside the app`,
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
            subtitle: 'Trailing 90 days',
            body: {
              items: [
                { id: 'enabled', label: 'Access enabled', value: snap.enabled_buyers, pct: 100, supporting: `${snap.enabled_buyers} customers can use the app` },
                { id: 'opened', label: 'Opened app', value: snap.opened_app_mtd, pct: snap.enabled_buyers > 0 ? Math.round((snap.opened_app_mtd / snap.enabled_buyers) * 100) : 0 },
                { id: 'ordered', label: `${primaryDemandVerb[0]?.toUpperCase()}${primaryDemandVerb.slice(1)} ${primaryDemandNoun}`, value: snap.ordered_mtd, pct: snap.enabled_buyers > 0 ? Math.round((snap.ordered_mtd / snap.enabled_buyers) * 100) : 0 },
                { id: 'repeat', label: `Repeat (2+ ${primaryDemandNoun})`, value: snap.repeat_mtd, pct: snap.enabled_buyers > 0 ? Math.round((snap.repeat_mtd / snap.enabled_buyers) * 100) : 0 },
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
            subtitle: 'Trailing 90 days',
            body: {
              items: [
                {
                  id: 'estimates',
                  label: primaryDemandKind === 'estimates' ? 'App enquiries' : 'App orders',
                  value: formatCompactInr(primaryDemandKind === 'estimates' ? snap.estimates_app_value_mtd : snap.converted_order_value_mtd),
                  pct: snap.total_gmv_mtd > 0 ? Math.round(((primaryDemandKind === 'estimates' ? snap.estimates_app_value_mtd : snap.converted_order_value_mtd) / snap.total_gmv_mtd) * 100) : 0,
                  supporting: primaryDemandKind === 'estimates'
                    ? `${snap.estimates_app_count_mtd} ${snap.estimates_app_count_mtd === 1 ? 'enquiry' : 'enquiries'}`
                    : `${snap.converted_order_count_mtd} ${snap.converted_order_count_mtd === 1 ? 'order' : 'orders'}`,
                },
                {
                  id: 'converted',
                  label: primaryDemandKind === 'estimates' ? 'Converted to order' : 'Repeat demand',
                  value: formatCompactInr(snap.converted_order_value_mtd),
                  pct: snap.app_gmv_mtd > 0 ? Math.round((snap.converted_order_value_mtd / snap.app_gmv_mtd) * 100) : 0,
                  supporting: primaryDemandKind === 'estimates' ? `${snap.converted_order_count_mtd} orders` : `${snap.repeat_mtd} repeat customers`,
                },
                {
                  id: 'invoiced',
                  label: 'Invoiced sales',
                  value: formatCompactInr(snap.invoiced_app_value_mtd),
                  pct: snap.total_gmv_mtd > 0 ? Math.round((snap.invoiced_app_value_mtd / snap.total_gmv_mtd) * 100) : 0,
                  supporting: `${snap.total_gmv_mtd > 0 ? Math.round((snap.invoiced_app_value_mtd / snap.total_gmv_mtd) * 100) : 0}% of total submitted demand`,
                },
              ],
              emptyTitle: 'No app-sourced business yet',
              emptyDescription: 'Commercial flow through the buyer app will appear here.',
            },
          }}
        />
        <PerformanceCard
          title="Top customers on app"
          subtitle="By app contribution"
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
            emptyDescription="Top customers will appear once the app starts generating demand."
          />
        </PerformanceCard>
        <DetailCardRenderer
          card={{
            id: 'buyer-app-location-usage',
            representation: 'mix',
            title: 'Adoption by location',
            subtitle: 'Buyer App demand and invoiced sales',
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
