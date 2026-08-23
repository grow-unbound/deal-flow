'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

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
import { BUYER_APP_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSellerPageView, useSellerCtaCapture } from '@/hooks/useSellerPageView';
import {
  useBuyerAppLanding,
  useBuyerAppMetrics,
  type BuyerAppLandingMetricsV4,
  type BuyerAppLandingResponse,
} from '@/hooks/useBuyerApp';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import { BuyerAppSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import {
  useWAU,
  useProductsViewed,
  useProductsAddedToCart,
  useCartSubmits,
} from '@/hooks/useBuyerAppPostHog';

const BuyerAppWeeklyActiveChart = dynamic(
  () => import('./BuyerAppWeeklyActiveChart').then((m) => m.BuyerAppWeeklyActiveChart),
  { ssr: false },
);
const BuyerAppDemandChart = dynamic(
  () => import('./BuyerAppDemandChart').then((m) => m.BuyerAppDemandChart),
  { ssr: false },
);

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
  useSellerPageView();
  const captureCta = useSellerCtaCapture();
  const period = initialPeriod;
  const horizonLabel = 'Trailing 90 days';
  const { data, isLoading, isError } = useBuyerAppLanding(period, initialData);
  const { data: metricsData } = useBuyerAppMetrics(initialMetrics);
  const retainedData = useRetainedValue(data);
  const landingData = data ?? retainedData;

  const { data: wauData } = useWAU();
  const { data: productsViewed } = useProductsViewed();
  const { data: productsAddedToCart } = useProductsAddedToCart();
  const { data: cartSubmits } = useCartSubmits();

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

  const primaryDemandKind = landingData.portfolio?.primary_demand_kind ?? 'orders';
  const primaryDemandNoun = primaryDemandKind === 'estimates' ? 'enquiries' : 'orders';
  const primaryDemandVerb = primaryDemandKind === 'estimates' ? 'submitted' : 'placed';
  const metricCards = metricsData?.cards ?? [];
  const formatMetricValue = (card: NonNullable<typeof metricCards>[number]) => {
    const idLabel = card.id.toLowerCase();
    if (
      idLabel.includes('value') ||
      idLabel.includes('sales') ||
      idLabel.includes('revenue') ||
      idLabel.includes('gmv') ||
      idLabel === 'app_sourced_demand_qtd'
    ) {
      return formatNumberValue(card.value ?? 0, 'CURRENCY_THRESHOLD');
    }
    if (idLabel.includes('rate') || idLabel.includes('share') || idLabel.includes('pct')) {
      return `${card.value ?? 0}%`;
    }
    return `${card.value ?? 0}`;
  };

  // True funnel drop-off: each pct relative to previous stage
  const funnelEnabled = snap.enabled_buyers;
  const funnelOpened = snap.opened_app_mtd;
  const funnelOrdered = snap.ordered_mtd;
  const funnelRepeat = snap.repeat_mtd;
  const openedPct = funnelEnabled > 0 ? Math.round((funnelOpened / funnelEnabled) * 100) : 0;
  const orderedPct = funnelOpened > 0 ? Math.round((funnelOrdered / funnelOpened) * 100) : 0;
  const repeatPct = funnelOrdered > 0 ? Math.round((funnelRepeat / funnelOrdered) * 100) : 0;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Engagement"
        title="Buyer App"
        subtitle={`${kpis.enabled_buyers} customers can self-serve · track business submitted through Buyer App.`}
        horizon={horizonLabel}
        primary="Manage Access"
        onPrimaryClick={() => {
          captureCta('manage_buyer_app_access');
          router.push('/buyer-app/access');
        }}
      />

      <InsightStrip4
        tiles={metricCards.slice(0, 4).map((card, index) => ({
          label: card.time_basis ? `${kpiLabel(BUYER_APP_KPI_COPY, card)} · ${card.time_basis}` : kpiLabel(BUYER_APP_KPI_COPY, card),
          value: formatMetricValue(card),
          sub: kpiSupportingText(BUYER_APP_KPI_COPY, card),
          tone: index === 1 ? 'accent' : undefined,
        }))}
      />

      <div className="buyer-app-cards mt-6 grid grid-cols-2 gap-6">
        {/* Card 1: Adoption funnel — true drop-off pct at each stage */}
        <DetailCardRenderer
          card={{
            id: 'buyer-app-adoption',
            representation: 'distribution',
            title: 'Adoption funnel',
            subtitle: 'Trailing 90 days',
            body: {
              items: [
                {
                  id: 'enabled',
                  label: 'Access enabled',
                  value: funnelEnabled,
                  pct: 100,
                  supporting: `${funnelEnabled} customers can use the app`,
                },
                {
                  id: 'opened',
                  label: 'Opened app',
                  value: funnelOpened,
                  pct: openedPct,
                },
                {
                  id: 'ordered',
                  label: `${primaryDemandVerb[0]?.toUpperCase()}${primaryDemandVerb.slice(1)} ${primaryDemandNoun}`,
                  value: funnelOrdered,
                  pct: orderedPct,
                },
                {
                  id: 'repeat',
                  label: `Repeat (2+ ${primaryDemandNoun})`,
                  value: funnelRepeat,
                  pct: repeatPct,
                },
              ],
              emptyTitle: 'No enabled buyers yet',
              emptyDescription: 'Adoption will appear once buyers are enabled for the app.',
              mode: 'funnel',
            },
          }}
        />

        {/* Card 2: Weekly active buyers — last 90 days */}
        <PerformanceCard
          title="Weekly active buyers"
          subtitle="Last 90 days"
          bodyClassName="p-0"
        >
          <BuyerAppWeeklyActiveChart data={wauData} loading={false} />
        </PerformanceCard>

        {/* Card 3: Products most viewed */}
        <PerformanceCard
          title="Products most viewed"
          subtitle="Last 90 days"
          bodyClassName="p-0"
        >
          <ScrollCardBody>
            <RankedList
              compact
              items={(productsViewed ?? []).map((item) => ({
                id: item.tenant_product_id,
                label: item.product_name,
                value: `${item.view_count} views`,
              }))}
              emptyTitle="No product view data yet"
              emptyDescription="Product views will appear here once buyers browse the app."
            />
          </ScrollCardBody>
        </PerformanceCard>

        {/* Card 4: Products most added to cart */}
        <PerformanceCard
          title="Products most added to cart"
          subtitle="Last 90 days"
          bodyClassName="p-0"
        >
          <ScrollCardBody>
            <RankedList
              compact
              items={(productsAddedToCart ?? []).map((item) => ({
                id: item.tenant_product_id,
                label: item.product_name,
                value: `${item.add_count} adds`,
              }))}
              emptyTitle="No cart data yet"
              emptyDescription="Products added to cart will appear here as buyers use the app."
            />
          </ScrollCardBody>
        </PerformanceCard>

        {/* Card 5: App demand over time — Value / Count toggle */}
        <PerformanceCard
          title="App demand"
          subtitle="Last 90 days"
          bodyClassName="p-0"
        >
          <BuyerAppDemandChart data={cartSubmits} loading={false} />
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
