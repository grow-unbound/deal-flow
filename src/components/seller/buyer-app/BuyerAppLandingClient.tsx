'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { FeatureGate } from '@/components/FeatureGate';
import {
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
} from '@/components/seller/layout';
import { DetailCardRenderer, PerformanceCard, RankedList } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { cn, formatNumberValue } from '@/lib/utils';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import {
  useBuyerAppLanding,
  useBuyerAppMetrics,
  type BuyerAppLandingMetricsV4,
  type BuyerAppLandingResponse,
} from '@/hooks/useBuyerApp';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { BuyerAppSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';

const BUYER_APP_SCROLL_CARD_HEIGHT = 'h-[320px]';

function ScrollCardBody({ children }: { children: ReactNode }) {
  const [scrollActive, setScrollActive] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        BUYER_APP_SCROLL_CARD_HEIGHT,
        'dashboard-vscroll overflow-y-auto',
        scrollActive && 'dashboard-vscroll--active',
      )}
      onScroll={() => {
        setScrollActive(true);
        if (resetTimerRef.current != null) {
          window.clearTimeout(resetTimerRef.current);
        }
        resetTimerRef.current = window.setTimeout(() => {
          setScrollActive(false);
          resetTimerRef.current = null;
        }, 900);
      }}
    >
      {children}
    </div>
  );
}

function BuyerAppLandingContent({
  initialData,
  initialMetrics,
  initialPeriod,
}: {
  initialData: BuyerAppLandingResponse | null;
  initialMetrics: BuyerAppLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const router = useRouter();
  const period = initialPeriod;
  const horizonLabel = 'Trailing 90 days';
  const metricSuffix = '90D';
  const { data, isLoading, isError } = useBuyerAppLanding(period, initialData);
  const { data: metricsData } = useBuyerAppMetrics(initialMetrics);
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
    invoiced_app_value_mtd: 0, invoiced_app_count_mtd: 0, invoiced_share_of_total_pct: 0,
    not_ordering_buyers: [], used_no_demand_buyers: [], no_app_buyers: [],
    top_locations: [], contribution_over_time: [], refreshed_at: '',
  };

  // % of ENABLED buyers who are repeat (2+ primary-demand documents).
  const repeatShareOfEnabledPct =
    snap && snap.enabled_buyers > 0 ? Math.round((snap.repeat_mtd / snap.enabled_buyers) * 100) : 0;
  const primaryDemandKind = landingData.portfolio?.primary_demand_kind ?? 'orders';
  const primaryDemandNoun = primaryDemandKind === 'estimates' ? 'enquiries' : 'orders';
  const primaryDemandNounSingular = primaryDemandKind === 'estimates' ? 'enquiry' : 'order';
  const primaryDemandVerb = primaryDemandKind === 'estimates' ? 'submitted' : 'placed';
  const metricCards = metricsData?.cards ?? [];
  const formatMetricValue = (card: NonNullable<typeof metricCards>[number]) => {
    const idLabel = `${card.id} ${card.label}`.toLowerCase();
    if (idLabel.includes('value') || idLabel.includes('sales') || idLabel.includes('revenue') || idLabel.includes('gmv')) {
      return formatNumberValue(card.value ?? 0, 'CURRENCY_THRESHOLD');
    }
    if (idLabel.includes('rate') || idLabel.includes('share') || idLabel.includes('pct')) {
      return `${card.value ?? 0}%`;
    }
    return `${card.value ?? 0}`;
  };

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
        tiles={metricCards.slice(0, 4).map((card, index) => ({
          label: card.time_basis ? `${card.label} · ${card.time_basis}` : card.label,
          value: formatMetricValue(card),
          sub: card.supporting_text ?? '',
          tone: index === 1 ? 'accent' : undefined,
        }))}
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
              mode: 'funnel',
            },
          }}
        />
        <DetailCardRenderer
          card={{
            id: 'buyer-app-business-through-app',
            representation: 'posture',
            title: 'Business through app',
            subtitle: 'Trailing 90 days',
            body: {
              tiles: [
                {
                  label: primaryDemandKind === 'estimates' ? 'App enquiries' : 'App orders',
                  value: formatNumberValue(primaryDemandKind === 'estimates' ? snap.estimates_app_value_mtd : snap.converted_order_value_mtd, 'CURRENCY_THRESHOLD'),
                  sub: `${snap.total_gmv_mtd > 0 ? Math.round(((primaryDemandKind === 'estimates' ? snap.estimates_app_value_mtd : snap.converted_order_value_mtd) / snap.total_gmv_mtd) * 100) : 0}% of total demand · ${
                    primaryDemandKind === 'estimates'
                      ? `${snap.estimates_app_count_mtd} ${snap.estimates_app_count_mtd === 1 ? 'enquiry' : 'enquiries'}`
                      : `${snap.converted_order_count_mtd} ${snap.converted_order_count_mtd === 1 ? 'order' : 'orders'}`
                  }`,
                },
                primaryDemandKind === 'estimates'
                  ? {
                      label: 'Converted to order',
                      value: formatNumberValue(snap.converted_order_value_mtd, 'CURRENCY_THRESHOLD'),
                      sub: `${snap.app_gmv_mtd > 0 ? Math.round((snap.converted_order_value_mtd / snap.app_gmv_mtd) * 100) : 0}% of app enquiries · ${snap.converted_order_count_mtd} orders`,
                    }
                  : {
                      label: 'Repeat demand',
                      value: `${snap.repeat_mtd}`,
                      sub: `${repeatShareOfEnabledPct}% of enabled customers · repeat buyers`,
                    },
                {
                  label: 'Invoiced sales',
                  value: formatNumberValue(snap.invoiced_app_value_mtd, 'CURRENCY_THRESHOLD'),
                  sub: `${snap.invoiced_share_of_total_pct}% of total invoiced sales`,
                },
              ],
            },
          }}
        />
        <PerformanceCard
          title="App contribution over time"
          subtitle="Monthly primary demand vs. converted invoices · Trailing 12 months"
          bodyClassName="p-0"
        >
          <ScrollCardBody>
            <RankedList
              compact
              items={[...snap.contribution_over_time].reverse().map((month) => {
                const conversionPct = month.app_demand_value > 0
                  ? Math.round((month.app_invoice_value / month.app_demand_value) * 100)
                  : 0;
                return {
                  id: month.month,
                  label: new Date(month.month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
                  meta: `${month.app_demand_count} ${month.app_demand_count === 1 ? primaryDemandNounSingular : primaryDemandNoun} · ${formatNumberValue(month.app_demand_value, 'CURRENCY_THRESHOLD')} demand`,
                  value: formatNumberValue(month.app_invoice_value, 'CURRENCY_THRESHOLD'),
                  valueSupporting: `${month.app_invoice_count} invoice${month.app_invoice_count !== 1 ? 's' : ''} · ${conversionPct}% converted`,
                };
              })}
              emptyTitle="No app contribution history yet"
              emptyDescription="Monthly app-sourced demand and invoiced sales will appear here once orders start invoicing through."
            />
          </ScrollCardBody>
        </PerformanceCard>
        <PerformanceCard
          title="Adoption by location"
          subtitle="Buyer App demand and converted invoices"
          bodyClassName="p-0"
          actions={<StatusTag label="Trailing 90 days" tone="neutral" />}
        >
          <ScrollCardBody>
            <RankedList
              compact
              items={snap.top_locations.map((location) => {
                const conversionPct = location.demand_value > 0
                  ? Math.round((location.invoice_value / location.demand_value) * 100)
                  : 0;
                return {
                  id: location.location_id,
                  label: location.name,
                  meta: `${location.demand_count} ${location.demand_count === 1 ? primaryDemandNounSingular : primaryDemandNoun} · ${location.demand_value > 0 ? formatNumberValue(location.demand_value, 'CURRENCY_THRESHOLD') : '—'} demand`,
                  value: location.invoice_value > 0 ? formatNumberValue(location.invoice_value, 'CURRENCY_THRESHOLD') : '—',
                  valueSupporting: `${location.invoice_count} invoice${location.invoice_count !== 1 ? 's' : ''} · ${conversionPct}% converted`,
                };
              })}
              emptyTitle="No location usage yet"
              emptyDescription="Location-level buyer app activity will show here once orders are placed."
            />
          </ScrollCardBody>
        </PerformanceCard>
      </div>
    </PageWrap>
  );
}

export function BuyerAppLandingClient({
  initialData,
  initialMetrics,
  initialPeriod,
}: {
  initialData: BuyerAppLandingResponse | null;
  initialMetrics: BuyerAppLandingMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  return (
    <FeatureGate flag="BUYER_APP">
      <BuyerAppLandingContent initialData={initialData} initialMetrics={initialMetrics} initialPeriod={initialPeriod} />
    </FeatureGate>
  );
}
