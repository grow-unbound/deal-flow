'use client';

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
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { DetailCardRenderer, PerformanceCard, RankedList } from '@/components/seller/detail';
import { ErrorState } from '@/components/ui/empty-state';
import { formatCompactInr, formatInr } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { SellerLandingPeriod } from '@/lib/seller-period';
import type { SellerDashboardFeed, SellerDashboardResponse } from '@/types/seller-dashboard';

function DashboardDataSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-[210px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="h-[320px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        <div className="h-[320px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
      </div>
    </div>
  );
}

function formatMetricValue(label: string, value: number) {
  if (label.includes('GMV') || label.includes('invoice') || label.includes('Spend')) {
    return formatCompactInr(value);
  }
  return String(value);
}

function formatMetricDelta(delta?: number, deltaLabel?: string) {
  if (typeof delta !== 'number') return deltaLabel ?? '';
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${delta}${deltaLabel ? ` ${deltaLabel}` : ''}`.trim();
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
          value: formatInr(row.amount),
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

function AdminSection({ data, newEntityIds, markSeen }: { data: SellerDashboardResponse; newEntityIds: Map<string, 'new'>; markSeen: (id: string) => void }) {
  const admin = data.admin;
  if (!admin) return null;

  return (
    <>
      <InsightStrip4
        tiles={admin.metrics.map((metric) => ({
          label: metric.label,
          value: formatMetricValue(metric.label, metric.value),
          sub: metric.sub,
          delta: formatMetricDelta(metric.delta, metric.delta_label),
          deltaTone: typeof metric.delta === 'number' ? (metric.delta >= 0 ? 'up' : 'down') : undefined,
          tone: metric.tone,
        }))}
      />
      <V3CalloutPanel
        items={admin.callouts.map((item) => ({
          ...item,
          rows: item.rows.map((row) => ({
            initials: row.initials,
            hue: row.hue,
            name: row.name,
            reason: row.reason,
            trailing: row.trailing,
          })),
        }))}
      />
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <DetailCardRenderer
          actions={(
            <Link href="/brands" className="text-sm font-semibold text-teal-700 no-underline">
              All brands
            </Link>
          )}
          card={{
            id: 'dashboard-brand-performance',
            representation: 'mix',
            title: 'Brand performance',
            subtitle: 'Revenue share for the selected period',
            body: {
              items: admin.top_brands.map((brand) => ({
                id: brand.id,
                label: brand.name,
                pct: brand.pct,
                value: brand.trend_label,
              })),
              emptyTitle: 'No brand data yet',
              emptyDescription: 'Revenue share will appear here once brand sales are available.',
              mode: 'mix',
            },
          }}
        />
        <PerformanceCard title="Recent activity" subtitle="Latest estimates, orders, and invoices" bodyClassName="p-0">
          <RankedList
            items={admin.recent_activity.map((row) => ({
              id: row.id,
              label: row.customer_name,
              meta: row.document_number,
              value: formatInr(row.amount),
              supporting: (
                <span className="inline-flex items-center gap-2">
                  <StatusTag label={row.status.label} tone={row.status.tone} />
                  <span>{formatTimeAgoLabel(row.updated_at)}</span>
                  {newEntityIds.has(row.id) ? <RealtimeBadge type="new" /> : null}
                </span>
              ),
              initials: row.customer_name.slice(0, 2).toUpperCase(),
            }))}
            emptyTitle="No recent activity yet"
            emptyDescription="The latest commercial documents will show up here."
          />
        </PerformanceCard>
      </div>
    </>
  );
}

function AssistantSection({ data, newEntityIds, markSeen }: { data: SellerDashboardResponse; newEntityIds: Map<string, 'new'>; markSeen: (id: string) => void }) {
  const assistant = data.assistant;
  if (!assistant) return null;

  return (
    <>
      <InsightStrip4
        tiles={assistant.metrics.map((metric) => ({
          label: metric.label,
          value: formatMetricValue(metric.label, metric.value),
          sub: metric.sub,
          tone: metric.tone,
        }))}
      />
      <V3CalloutPanel
        items={assistant.callouts.map((item) => ({
          ...item,
          rows: item.rows.map((row) => ({
            initials: row.initials,
            hue: row.hue,
            name: row.name,
            reason: row.reason,
            trailing: row.trailing,
          })),
        }))}
      />
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
  const horizonLabel = 'This Month';
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
    ? `${dashboard.tenant.business_name} across ${dashboard.tenant.location_names.length || 1} location${dashboard.tenant.location_names.length === 1 ? '' : 's'}. Orders, catalogs, inventory, and transaction flow for ${horizonLabel.toLowerCase()}.`
    : `Action centre for ${dashboard.tenant.location_names.length > 0 ? dashboard.tenant.location_names.join(', ') : 'your assigned locations'}. Focus on confirmations, collections, and follow-ups for ${horizonLabel.toLowerCase()}.`;

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        subtitle={subtitle}
        horizon={horizonLabel}
      />

      {isLoading && !data ? <DashboardSkeleton /> : (
        <>
          {dashboard.role === 'seller_admin' ? <AdminSection data={dashboard} newEntityIds={newEntityIds} markSeen={markSeen} /> : <AssistantSection data={dashboard} newEntityIds={newEntityIds} markSeen={markSeen} />}
        </>
      )}
    </PageWrap>
  );
}
