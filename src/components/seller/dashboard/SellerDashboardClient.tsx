'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { useSellerDashboard } from '@/hooks/useSellerDashboard';
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
import { DetailCardRenderer, DistributionList, PerformanceCard, RankedList } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { cn, formatAsOfLabel, formatNumberValue } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type {
  SellerDashboardBusinessFlowMeta,
  SellerDashboardCustomerActivityMeta,
  SellerDashboardFeed,
  SellerDashboardLocationComparisonEntry,
  SellerDashboardMixEntry,
  SellerDashboardResponse,
  SellerDashboardSalesMixMeta,
} from '@/types/seller-dashboard';

type SalesMixDimension = 'brand' | 'category' | 'location';
const DASHBOARD_SCROLL_CARD_HEIGHT = 'h-[320px]';

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

function exploreMeta(data: SellerDashboardResponse, id: string): Record<string, unknown> {
  const item = data.portfolio?.explore?.find((entry) => entry.id === id);
  return (item?.meta as Record<string, unknown> | undefined) ?? {};
}

function businessFlowMeta(data: SellerDashboardResponse): SellerDashboardBusinessFlowMeta {
  return exploreMeta(data, 'business_flow') as SellerDashboardBusinessFlowMeta;
}

function salesMixMeta(data: SellerDashboardResponse): SellerDashboardSalesMixMeta {
  return exploreMeta(data, 'sales_mix') as SellerDashboardSalesMixMeta;
}

function customerActivityMeta(data: SellerDashboardResponse): SellerDashboardCustomerActivityMeta {
  return exploreMeta(data, 'customer_activity') as SellerDashboardCustomerActivityMeta;
}

function locationComparisonMeta(data: SellerDashboardResponse): SellerDashboardLocationComparisonEntry[] {
  const meta = exploreMeta(data, 'location_comparison');
  return (Array.isArray(meta.locations) ? meta.locations : []) as SellerDashboardLocationComparisonEntry[];
}

function normalizeMixEntries(entries: SellerDashboardMixEntry[]) {
  const visibleEntries = entries
    .map((entry) => ({
      ...entry,
      value: Number(entry.value ?? 0),
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value >= 0)
  const total = visibleEntries.reduce((sum, entry) => sum + entry.value, 0);

  return {
    items: visibleEntries.map((entry) => ({
      id: entry.id,
      label: entry.name,
      pct: total > 0 ? Number(((entry.value / total) * 100).toFixed(1)) : 0,
      value: formatNumberValue(entry.value, 'CURRENCY_THRESHOLD'),
    })),
    total,
  };
}

function salesMixItems(meta: SellerDashboardSalesMixMeta, locationEntries: SellerDashboardLocationComparisonEntry[], dimension: SalesMixDimension) {
  if (dimension === 'brand') {
    return normalizeMixEntries(Array.isArray(meta.brands) ? meta.brands : []);
  }
  if (dimension === 'category') {
    return normalizeMixEntries(Array.isArray(meta.categories) ? meta.categories : []);
  }
  return normalizeMixEntries(
    locationEntries.map((entry) => ({
      id: entry.location_id,
      name: entry.name,
      value: Number(entry.invoiced_sales_90d ?? 0),
    })),
  );
}

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
        DASHBOARD_SCROLL_CARD_HEIGHT,
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

function AdminSection({ data, newEntityIds, markSeen }: { data: SellerDashboardResponse; newEntityIds: Map<string, 'new'>; markSeen: (id: string) => void }) {
  const admin = data.admin;
  const [salesMixDimension, setSalesMixDimension] = useState<SalesMixDimension>('brand');
  const [salesMixSheetOpen, setSalesMixSheetOpen] = useState(false);
  const [locationComparisonSheetOpen, setLocationComparisonSheetOpen] = useState(false);
  const [recentActivitySheetOpen, setRecentActivitySheetOpen] = useState(false);
  if (!admin) return null;

  const businessFlow = businessFlowMeta(data);
  const salesMix = salesMixMeta(data);
  const customerActivity = customerActivityMeta(data);
  const locationComparison = locationComparisonMeta(data);

  const businessFlowTiles = [
    {
      label: 'Invoiced sales',
      value: formatNumberValue(Number(businessFlow.invoice_value_this_month ?? 0), 'CURRENCY_THRESHOLD'),
      sub: `${Number(businessFlow.invoice_count_this_month ?? 0)} invoice${Number(businessFlow.invoice_count_this_month ?? 0) === 1 ? '' : 's'}`,
    },
    businessFlow.orders_enabled ? {
      label: 'Order value',
      value: formatNumberValue(Number(businessFlow.order_value_this_month ?? 0), 'CURRENCY_THRESHOLD'),
      sub: `${Number(businessFlow.order_count_this_month ?? 0)} orders`,
    } : null,
    businessFlow.estimates_enabled ? {
      label: 'Estimate value',
      value: formatNumberValue(Number(businessFlow.estimate_value_this_month ?? 0), 'CURRENCY_THRESHOLD'),
      sub: `${Number(businessFlow.estimate_count_this_month ?? 0)} estimates`,
    } : null,
  ].filter((tile): tile is NonNullable<typeof tile> => tile !== null);

  const mixResult = salesMixItems(salesMix, locationComparison, salesMixDimension);
  const locationComparisonItems = locationComparison.map((location) => ({
    id: location.location_id,
    label: location.name,
    meta: (
      <span>
        Open demand {formatNumberValue(Number(location.open_primary_demand_value ?? 0), 'CURRENCY_THRESHOLD')} · Overdue {formatNumberValue(Number(location.overdue_amount ?? 0), 'CURRENCY_THRESHOLD')}
      </span>
    ),
    metaClassName: 'text-sm text-cream-600',
    value: formatNumberValue(Number(location.invoiced_sales_90d ?? 0), 'CURRENCY_THRESHOLD'),
    valueSupporting: 'Invoiced sales',
    initials: location.name.slice(0, 2).toUpperCase(),
    hue: 'teal' as const,
  }));
  const recentActivityItems = admin.recent_activity.map((row) => ({
    id: row.id,
    label: (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">{row.customer_name}</span>
        <StatusTag label={row.status.label} tone={row.status.tone} className="shrink-0" />
      </div>
    ),
    meta: (
      <span>
        {row.document_number} · {formatTimeAgoLabel(row.updated_at)}
      </span>
    ),
    metaClassName: 'text-xs text-cream-700',
    value: formatNumberValue(row.amount, 'CURRENCY_THRESHOLD'),
    valueSupporting: newEntityIds.has(row.id) ? <RealtimeBadge type="new" /> : null,
    initials: row.customer_name.slice(0, 2).toUpperCase(),
  }));
  const salesMixSubtitle = `Invoiced sales by ${salesMixDimension}, last 90 days`;
  const asOfLabel = formatAsOfLabel(data.portfolio?.as_of);

  return (
    <>
      <InsightStrip4
        tiles={admin.metrics.map((metric) => ({
          label: metric.label,
          value: formatNumberValue(metric.value, metric.label === 'Recently sold products out of stock' || metric.label === 'Low-stock alerts' || metric.label === 'Open estimates' || metric.label === 'Orders to confirm' || metric.label === 'Overdue invoices' ? 'COUNT' : 'CURRENCY_THRESHOLD'),
          sub: metric.sub,
          tone: metric.tone,
        }))}
      />
      {asOfLabel ? (
        <p className="-mt-2 mb-1 text-xs text-cream-600">{asOfLabel}</p>
      ) : null}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <DetailCardRenderer
          card={{
            id: 'dashboard-business-flow',
            representation: 'posture',
            title: 'Business flow',
            subtitle: 'Last 90 days',
            body: {
              tiles: businessFlowTiles,
              showSupportingText: true,
            },
          }}
        />
        <DetailCardRenderer
          card={{
            id: 'dashboard-customer-activity',
            representation: 'posture',
            title: 'Customer activity',
            subtitle: 'Last 90 days',
            body: {
              tiles: [
                { label: 'Purchasing Customers', value: formatNumberValue(Number(customerActivity.purchasing_customers_90d ?? 0), 'COUNT') },
                { label: 'Repeat Customers', value: formatNumberValue(Number(customerActivity.repeat_customers_90d ?? 0), 'COUNT') },
                { label: 'Inactive Customers', value: formatNumberValue(Number(customerActivity.inactive_customers_90d ?? 0), 'COUNT'), tone: Number(customerActivity.inactive_customers_90d ?? 0) > 0 ? 'warn' : undefined },
                { label: 'Overdue Customers', value: formatNumberValue(Number(customerActivity.overdue_customers_now ?? 0), 'COUNT'), tone: Number(customerActivity.overdue_customers_now ?? 0) > 0 ? 'warn' : undefined },
              ],
              columns: 'two-by-two',
            },
          }}
        />
        <DetailCardRenderer
          bodyClassName={cn(DASHBOARD_SCROLL_CARD_HEIGHT, 'dashboard-vscroll overflow-y-auto p-0')}
          actions={(
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-full border border-cream-300 bg-cream-50 p-1">
                {[
                  { id: 'brand' as const, label: 'Brand' },
                  { id: 'category' as const, label: 'Category' },
                  { id: 'location' as const, label: 'Location' },
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
              emptyTitle: `No ${salesMixDimension} data yet`,
              emptyDescription: 'Revenue share will appear here once invoiced sales are available for this view.',
              mode: 'mix',
            },
          }}
        />
        <PerformanceCard
          title="Location comparison"
          subtitle="Invoiced sales, open demand, and overdue by location"
          bodyClassName="p-0"
          actions={(
            <button
              type="button"
              className="text-sm font-semibold text-teal-700 no-underline"
              onClick={() => setLocationComparisonSheetOpen(true)}
            >
              See all
            </button>
          )}
        >
          <ScrollCardBody>
            <RankedList
              items={locationComparisonItems}
              emptyTitle="No location metrics yet"
              emptyDescription="Location comparisons will appear once location-level invoiced sales are available."
            />
          </ScrollCardBody>
        </PerformanceCard>
        <PerformanceCard
          title="Recent activity"
          subtitle="Latest estimates, orders, and invoices"
          bodyClassName="p-0"
          actions={(
            <button
              type="button"
              className="text-sm font-semibold text-teal-700 no-underline"
              onClick={() => setRecentActivitySheetOpen(true)}
            >
              See all
            </button>
          )}
        >
          <ScrollCardBody>
            <RankedList
              items={recentActivityItems}
              emptyTitle="No recent activity yet"
              emptyDescription="The latest commercial documents will show up here."
            />
          </ScrollCardBody>
        </PerformanceCard>
      </div>
      <SeeAllSheet
        open={salesMixSheetOpen}
        onOpenChange={setSalesMixSheetOpen}
        title="Sales mix"
        subtitle={salesMixSubtitle}
        columns={[
          { label: salesMixDimension === 'brand' ? 'Brand' : salesMixDimension === 'category' ? 'Category' : 'Location' },
          { label: 'Share', align: 'right', width: 90 },
          { label: 'Sales', align: 'right', width: 120 },
        ]}
        items={mixResult.items}
        renderRow={(item) => (
          <tr key={item.id} className="border-b border-cream-200 last:border-b-0">
            <td className="px-5 py-4 text-sm font-medium text-cream-900">{item.label}</td>
            <td className="px-5 py-4 text-right text-sm text-cream-700">{item.pct}%</td>
            <td className="px-5 py-4 text-right text-sm text-cream-900">{item.value}</td>
          </tr>
        )}
      />
      <SeeAllSheet
        open={locationComparisonSheetOpen}
        onOpenChange={setLocationComparisonSheetOpen}
        title="Location comparison"
        subtitle="Invoiced sales, open demand, and overdue by location"
        columns={[
          { label: 'Location' },
          { label: 'Summary', width: '55%' },
        ]}
        items={locationComparison}
        renderRow={(location) => (
          <tr key={location.location_id} className="border-b border-cream-200 last:border-b-0">
            <td className="px-5 py-4 text-sm font-medium text-cream-900">{location.name}</td>
            <td className="px-5 py-4 text-sm text-cream-700">
              <div>Invoiced {formatNumberValue(Number(location.invoiced_sales_90d ?? 0), 'CURRENCY_THRESHOLD')}</div>
              <div>Open demand {formatNumberValue(Number(location.open_primary_demand_value ?? 0), 'CURRENCY_THRESHOLD')}</div>
              <div>Overdue {formatNumberValue(Number(location.overdue_amount ?? 0), 'CURRENCY_THRESHOLD')}</div>
            </td>
          </tr>
        )}
      />
      <SeeAllSheet
        open={recentActivitySheetOpen}
        onOpenChange={setRecentActivitySheetOpen}
        title="Recent activity"
        subtitle="Latest estimates, orders, and invoices"
        columns={[
          { label: 'Customer' },
          { label: 'Document', width: 100 },
          { label: 'Status', width: 100 },
          { label: 'Amount', align: 'right', width: 100 },
        ]}
        items={admin.recent_activity}
        renderRow={(row) => (
          <tr key={row.id} className="border-b border-cream-200 last:border-b-0">
            <td className="px-5 py-4 text-sm font-medium text-cream-900">{row.customer_name}</td>
            <td className="px-5 py-4 text-sm text-cream-700">{row.document_number}</td>
            <td className="px-5 py-4 text-sm text-cream-700">{row.status.label}</td>
            <td className="px-5 py-4 text-right text-sm text-cream-900">{formatNumberValue(row.amount, 'CURRENCY_THRESHOLD')}</td>
          </tr>
        )}
      />
    </>
  );
}

function AssistantSection({ data, newEntityIds, markSeen }: { data: SellerDashboardResponse; newEntityIds: Map<string, 'new'>; markSeen: (id: string) => void }) {
  const assistant = data.assistant;
  if (!assistant) return null;
  const asOfLabel = formatAsOfLabel(data.portfolio?.as_of);

  return (
    <>
      <InsightStrip4
        tiles={assistant.metrics.map((metric) => ({
          label: metric.label,
          value: formatNumberValue(metric.value, metric.label === 'Recently sold products out of stock' || metric.label === 'Low-stock alerts' || metric.label === 'Open estimates' || metric.label === 'Orders to confirm' || metric.label === 'Overdue invoices' ? 'COUNT' : 'CURRENCY_THRESHOLD'),
          sub: metric.sub,
          tone: metric.tone,
        }))}
      />
      {asOfLabel ? (
        <p className="-mt-2 mb-1 text-xs text-cream-600">{asOfLabel}</p>
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
  initialPeriod,
}: {
  initialData: SellerDashboardResponse | null;
  initialPeriod: SellerLandingPeriod;
}) {
  const period = initialPeriod;
  const horizonLabel = 'Last 90 Days';
  const { data, isLoading, isError } = useSellerDashboard(period, initialData);
  const retainedData = useRetainedValue(data);
  const dashboard = data ?? retainedData;
  const { newEntityIds, markSeen } = useSellerRealtimeContext();

  if (!dashboard && isLoading) {
    return (
      <PageWrap>
        <DashboardSkeleton />
      </PageWrap>
    );
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

      {isLoading && !dashboard ? <DashboardSkeleton /> : (
        <>
          {dashboard.role === 'seller_admin' ? <AdminSection data={dashboard} newEntityIds={newEntityIds} markSeen={markSeen} /> : <AssistantSection data={dashboard} newEntityIds={newEntityIds} markSeen={markSeen} />}
        </>
      )}
    </PageWrap>
  );
}
