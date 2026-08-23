'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import {
  useSellerDashboard,
  useSellerDashboardBusinessFlow,
  useSellerDashboardCustomerActivity,
  useSellerDashboardLocationPerformance,
  useSellerDashboardMetrics,
  useSellerDashboardSalesMix,
} from '@/hooks/useSellerDashboard';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import { useSellerRealtimeContext } from '@/contexts/SellerRealtimeContext';
import { DashboardSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import {
  InsightStrip4,
  PageHeader,
  PageWrap,
  SeeAllSheet,
  StatusTag,
} from '@/components/seller/layout';
import { DetailCardRenderer, PerformanceCard, RankedList } from '@/components/seller/detail';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { cn, formatAsOfLabel, formatNumberValue } from '@/lib/utils';
import { DASHBOARD_KPI_COPY, kpiLabel, kpiSupportingText } from '@/lib/seller-landing-kpi-copy';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type {
  SellerDashboardFeed,
  SellerDashboardMetricsV4,
  SellerDashboardResponse,
  SellerDashboardSalesMixDimension,
  SellerDashboardSalesMixItemV4,
} from '@/types/seller-dashboard';

const BusinessFlowChart = dynamic(
  () => import('./BusinessFlowChart').then((m) => m.BusinessFlowChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> },
);
const CustomerActivityDonut = dynamic(
  () => import('./CustomerActivityDonut').then((m) => m.CustomerActivityDonut),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> },
);
const LocationPerformanceGrid = dynamic(
  () => import('./LocationPerformanceGrid').then((m) => m.LocationPerformanceGrid),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> },
);

const DASHBOARD_SCROLL_CARD_HEIGHT = 'h-[320px]';

function formatDashboardMetricCard(card: SellerDashboardMetricsV4['cards'][number]) {
  const idLabel = card.id.toLowerCase();
  if (idLabel.includes('rate') || idLabel.includes('pct') || idLabel.includes('share')) {
    return `${card.value ?? 0}%`;
  }
  if (idLabel.includes('count') || idLabel.includes('customers') || idLabel.includes('orders') || idLabel.includes('invoices') || idLabel.includes('estimates')) {
    return formatNumberValue(card.value ?? 0, 'COUNT');
  }
  return formatNumberValue(card.value ?? 0, 'CURRENCY_THRESHOLD');
}

function FeedCard({ feed, newEntityIds, markSeen }: { feed: SellerDashboardFeed; newEntityIds: Map<string, 'new'>; markSeen: (id: string) => void }) {
  return (
    <PerformanceCard
      title={feed.title}
      subtitle="Latest 5 by recent activity"
      actions={(
        <Link href={feed.href} className="text-sm font-semibold text-teal-700 no-underline">
          View all
        </Link>
      )}
      bodyClassName="p-0"
    >
      <RankedList
        items={feed.rows.map((row) => ({
          id: row.id,
          label: row.customer_name,
          meta: row.document_number,
          value: formatNumberValue(row.amount, 'CURRENCY_THRESHOLD'),
          supporting: (
            <span className="inline-flex items-center gap-2">
              <StatusTag label={row.status.label} tone={row.status.tone} className="shrink-0" />
              <span>{formatTimeAgoLabel(row.updated_at)}</span>
              {newEntityIds.has(row.id) ? <RealtimeBadge type="new" /> : null}
            </span>
          ),
          initials: row.customer_name.slice(0, 2).toUpperCase(),
        }))}
        emptyTitle={feed.empty_label}
        emptyDescription="New documents will appear here as your team works."
      />
    </PerformanceCard>
  );
}

function formatTimeAgoLabel(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaHours = Math.max(0, Math.round(deltaMs / (60 * 60 * 1000)));
  if (deltaHours < 1) return 'Updated just now';
  if (deltaHours < 24) return `Updated ${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  if (deltaDays < 7) return `Updated ${deltaDays}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
}

function formatMonthDelta(current: number, prior: number): string {
  if (prior <= 0) return current > 0 ? 'New this month' : 'No sales last month';
  const pct = ((current - prior) / prior) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${formatNumberValue(prior, 'CURRENCY_THRESHOLD')} last month · ${sign}${pct.toFixed(0)}%`;
}

/** Prior-month comparison surfaces via DistributionList's `supporting` slot
 *  per item rather than a new grouped-bar visual -- reuses the existing
 *  share-bar component as-is. */
function normalizeSalesMixItems(items: SellerDashboardSalesMixItemV4[]) {
  const visible = items
    .map((item) => ({ ...item, current_value: Number(item.current_value ?? 0), prior_value: Number(item.prior_value ?? 0) }))
    .filter((item) => Number.isFinite(item.current_value) && item.current_value >= 0);
  const total = visible.reduce((sum, item) => sum + item.current_value, 0);

  return {
    items: visible.map((item) => ({
      id: item.id,
      label: item.name,
      pct: total > 0 ? Number(((item.current_value / total) * 100).toFixed(1)) : 0,
      value: formatNumberValue(item.current_value, 'CURRENCY_THRESHOLD'),
      supporting: formatMonthDelta(item.current_value, item.prior_value),
    })),
    total,
  };
}

function AdminSection({
  data,
  metrics,
}: {
  data: SellerDashboardResponse;
  metrics: SellerDashboardMetricsV4 | null | undefined;
}) {
  const admin = data.admin;
  const [salesMixDimension, setSalesMixDimension] = useState<SellerDashboardSalesMixDimension>('brands');
  const [salesMixSheetOpen, setSalesMixSheetOpen] = useState(false);
  const { data: businessFlowData, isLoading: businessFlowLoading } = useSellerDashboardBusinessFlow();
  const { data: customerActivityData, isLoading: customerActivityLoading } = useSellerDashboardCustomerActivity();
  const { data: salesMixData } = useSellerDashboardSalesMix(salesMixDimension);
  const { data: locationPerformanceData, isLoading: locationPerformanceLoading } = useSellerDashboardLocationPerformance();
  if (!admin) return null;

  const mixResult = normalizeSalesMixItems(salesMixData?.items ?? []);
  const salesMixDimensionLabel = salesMixDimension === 'brands' ? 'Brand' : 'Category';
  const salesMixSubtitle = `Invoiced sales by ${salesMixDimensionLabel.toLowerCase()}, current vs prior month`;
  const asOfLabel = formatAsOfLabel(metrics?.computed_at);

  return (
    <>
      <InsightStrip4
        tiles={(metrics?.cards ?? []).slice(0, 4).map((metric) => ({
          label: metric.time_basis ? `${kpiLabel(DASHBOARD_KPI_COPY, metric)} · ${metric.time_basis}` : kpiLabel(DASHBOARD_KPI_COPY, metric),
          value: formatDashboardMetricCard(metric),
          sub: kpiSupportingText(DASHBOARD_KPI_COPY, metric),
        }))}
      />
      {asOfLabel ? (
        <p className="mt-2 mb-1 text-right text-xs text-cream-600">{asOfLabel}</p>
      ) : null}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <PerformanceCard title="Business flow" subtitle="Trailing 6 months" bodyClassName="p-0">
          <BusinessFlowChart data={businessFlowData} loading={businessFlowLoading} />
        </PerformanceCard>
        <PerformanceCard title="Customer activity" subtitle="Current quarter" bodyClassName="p-0">
          <CustomerActivityDonut data={customerActivityData} loading={customerActivityLoading} />
        </PerformanceCard>
        <DetailCardRenderer
          bodyClassName={cn(DASHBOARD_SCROLL_CARD_HEIGHT, 'dashboard-vscroll overflow-y-auto p-0')}
          actions={(
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-full border border-cream-300 bg-cream-50 p-1">
                {[
                  { id: 'brands' as const, label: 'Brand' },
                  { id: 'categories' as const, label: 'Category' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSalesMixDimension(option.id)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                      salesMixDimension === option.id
                        ? 'bg-white text-teal-700 shadow-sm'
                        : 'text-cream-700 hover:text-cream-900',
                    )}
                    aria-pressed={salesMixDimension === option.id}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-teal-700 no-underline"
                onClick={() => setSalesMixSheetOpen(true)}
              >
                See all
              </button>
            </div>
          )}
          card={{
            id: 'dashboard-sales-mix',
            representation: 'mix',
            title: 'Sales mix',
            subtitle: salesMixSubtitle,
            body: {
              items: mixResult.items,
              emptyTitle: `No ${salesMixDimensionLabel.toLowerCase()} data yet`,
              emptyDescription: 'Revenue share will appear here once invoiced sales are available for this view.',
              mode: 'mix',
            },
          }}
        />
        <PerformanceCard
          title="Location performance"
          subtitle="Sales, overdue, and open demand by location"
          bodyClassName="p-0"
        >
          <LocationPerformanceGrid locations={locationPerformanceData?.locations} loading={locationPerformanceLoading} />
        </PerformanceCard>
      </div>
      <SeeAllSheet
        open={salesMixSheetOpen}
        onOpenChange={setSalesMixSheetOpen}
        title="Sales mix"
        subtitle={salesMixSubtitle}
        columns={[
          { label: salesMixDimensionLabel },
          { label: 'Share', align: 'right', width: 90 },
          { label: 'Sales', align: 'right', width: 120 },
        ]}
        items={mixResult.items}
        renderRow={(item) => (
          <tr key={item.id} className="border-b border-cream-200 last:border-b-0">
            <td className="px-5 py-4 text-sm font-medium text-cream-900">
              <div>{item.label}</div>
              <div className="text-xs font-normal text-cream-600">{item.supporting}</div>
            </td>
            <td className="px-5 py-4 text-right text-sm text-cream-700">{item.pct}%</td>
            <td className="px-5 py-4 text-right text-sm text-cream-900">{item.value}</td>
          </tr>
        )}
      />
    </>
  );
}

function AssistantSection({
  data,
  metrics,
  newEntityIds,
  markSeen,
}: {
  data: SellerDashboardResponse;
  metrics: SellerDashboardMetricsV4 | null | undefined;
  newEntityIds: Map<string, 'new'>;
  markSeen: (id: string) => void;
}) {
  const assistant = data.assistant;
  if (!assistant) return null;
  const asOfLabel = formatAsOfLabel(metrics?.computed_at);

  return (
    <>
      <InsightStrip4
        tiles={(metrics?.cards ?? []).slice(0, 4).map((metric) => ({
          label: metric.time_basis ? `${kpiLabel(DASHBOARD_KPI_COPY, metric)} · ${metric.time_basis}` : kpiLabel(DASHBOARD_KPI_COPY, metric),
          value: formatDashboardMetricCard(metric),
          sub: kpiSupportingText(DASHBOARD_KPI_COPY, metric),
        }))}
      />
      {asOfLabel ? (
        <p className="mt-2 mb-1 text-right text-xs text-cream-600">{asOfLabel}</p>
      ) : null}
      <div className={cn('mt-5 grid gap-5', assistant.feeds.length >= 3 ? 'grid-cols-1 xl:grid-cols-3' : assistant.feeds.length === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
        {assistant.feeds.map((feed) => (
          <FeedCard key={feed.id} feed={feed} newEntityIds={newEntityIds} markSeen={markSeen} />
        ))}
      </div>
    </>
  );
}

export function SellerDashboardClient({
  initialData,
  initialMetrics = null,
  initialPeriod,
}: {
  initialData: SellerDashboardResponse | null;
  initialMetrics?: SellerDashboardMetricsV4 | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const period = initialPeriod;
  const horizonLabel = 'Last 90 Days';
  const { data, isLoading, isError } = useSellerDashboard(period, initialData);
  const { data: metricsData } = useSellerDashboardMetrics(period, initialMetrics);
  const retainedData = useRetainedValue(data);
  const dashboard = data ?? retainedData;
  const { newEntityIds, markSeen } = useSellerRealtimeContext();

  if (!dashboard && isLoading) {
    return <DashboardSkeleton />;
  }

  if (!dashboard || isError) {
    return (
      <PageWrap>
        <ErrorState heading="Couldn't load the dashboard" description="There was a problem fetching this seller dashboard." />
      </PageWrap>
    );
  }

  const subtitle = dashboard.role === 'seller_admin'
    ? `${dashboard.tenant.business_name} across ${dashboard.tenant.location_names.length || 1} location${dashboard.tenant.location_names.length === 1 ? '' : 's'}`
    : `Action centre for ${dashboard.tenant.location_names.length > 0 ? dashboard.tenant.location_names.join(', ') : 'your assigned locations'} · confirmations, collections, and follow-ups right now.`;

  return (
    <PageWrap>
      <div className="hidden md:block">
        <PageHeader
          eyebrow="Operations"
          title="Dashboard"
          subtitle={subtitle}
          horizon={horizonLabel}
        />
      </div>

      {dashboard.role === 'seller_admin'
        ? <AdminSection data={dashboard} metrics={metricsData} />
        : <AssistantSection data={dashboard} metrics={metricsData} newEntityIds={newEntityIds} markSeen={markSeen} />}
    </PageWrap>
  );
}
