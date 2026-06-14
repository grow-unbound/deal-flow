'use client';

import Link from 'next/link';

import { useSellerLandingPeriod } from '@/hooks/useSellerLandingPeriod';
import { useSellerDashboard } from '@/hooks/useSellerDashboard';
import { useRetainedValue } from '@/hooks/useRetainedValue';
import {
  EntityAvatar,
  InsightStrip4,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
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

function FeedCard({ feed }: { feed: SellerDashboardFeed }) {
  return (
    <section className="rounded-[14px] border border-cream-300 bg-white">
      <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
        <div>
          <h2 className="text-md font-semibold text-cream-900">{feed.title}</h2>
          <p className="text-sm text-cream-600">Latest 5 by recent activity</p>
        </div>
        <Link href={feed.href} className="text-sm font-semibold text-teal-700 no-underline">
          View all
        </Link>
      </div>
      <div className="p-5">
        {feed.rows.length === 0 ? (
          <p className="text-sm text-cream-600">{feed.empty_label}</p>
        ) : (
          <div className="space-y-3">
            {feed.rows.map((row) => (
              <Link
                key={row.id}
                href={row.href}
                className="flex items-start justify-between gap-4 rounded-[12px] border border-cream-200 px-4 py-3 text-left no-underline transition hover:border-cream-300 hover:bg-cream-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm text-cream-700">{row.document_number}</p>
                    <StatusTag label={row.status.label} tone={row.status.tone} className="shrink-0" />
                  </div>
                  <p className="mt-1 truncate text-base font-medium text-cream-900">{row.customer_name}</p>
                  <p className="mt-1 text-sm text-cream-600">{formatTimeAgoLabel(row.updated_at)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-cream-900">{formatInr(row.amount)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
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

function AdminSection({ data }: { data: SellerDashboardResponse }) {
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
        <section className="rounded-[14px] border border-cream-300 bg-white">
          <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
            <div>
              <h2 className="text-md font-semibold text-cream-900">Brand performance</h2>
              <p className="text-sm text-cream-600">Revenue share for the selected period</p>
            </div>
            <Link href="/brands" className="text-sm font-semibold text-teal-700 no-underline">
              All brands
            </Link>
          </div>
          <div className="space-y-3 p-5">
            {admin.top_brands.length === 0 ? (
              <p className="text-sm text-cream-600">No brand data yet.</p>
            ) : (
              admin.top_brands.map((brand) => (
                <div key={brand.id} className="flex items-center gap-3">
                  <EntityAvatar initials={brand.initials} hue={brand.hue} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-base font-medium text-cream-900">{brand.name}</p>
                      <p className="text-sm font-medium text-cream-700">{brand.trend_label}</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-200">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${brand.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="rounded-[14px] border border-cream-300 bg-white">
          <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
            <div>
              <h2 className="text-md font-semibold text-cream-900">Recent activity</h2>
              <p className="text-sm text-cream-600">Latest estimates, orders, and invoices</p>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {admin.recent_activity.length === 0 ? (
              <p className="text-sm text-cream-600">No recent activity yet.</p>
            ) : (
              admin.recent_activity.map((row) => (
                <Link
                  key={row.id}
                  href={row.href}
                  className="flex items-start justify-between gap-4 rounded-[12px] border border-cream-200 px-4 py-3 no-underline transition hover:border-cream-300 hover:bg-cream-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-cream-700">{row.document_number}</p>
                      <StatusTag label={row.status.label} tone={row.status.tone} />
                    </div>
                    <p className="mt-1 truncate text-base font-medium text-cream-900">{row.customer_name}</p>
                    <p className="mt-1 text-sm text-cream-600">{formatTimeAgoLabel(row.updated_at)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-cream-900">{formatInr(row.amount)}</p>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function AssistantSection({ data }: { data: SellerDashboardResponse }) {
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
          <FeedCard key={feed.id} feed={feed} />
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
  const { period, setPeriod, horizonLabel, options } = useSellerLandingPeriod(initialPeriod);
  const { data, isLoading, isError } = useSellerDashboard(period, initialData);
  const retainedData = useRetainedValue(data);
  const dashboard = data ?? retainedData;

  if (!dashboard && isLoading) {
    return (
      <PageWrap>
        <DashboardDataSkeleton />
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
        period={period}
        periodOptions={options}
        onPeriodChange={setPeriod}
      />

      {isLoading && !data ? <DashboardDataSkeleton /> : null}
      {dashboard.role === 'seller_admin' ? <AdminSection data={dashboard} /> : <AssistantSection data={dashboard} />}

      <section className="mt-5 rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-200 px-5 py-4">
          <h2 className="text-md font-semibold text-cream-900">Tenant details</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-3">
          <div>
            <p className="eyebrow text-cream-600">Tenant</p>
            <p className="mt-1 text-base font-medium text-cream-900">{dashboard.tenant.business_name}</p>
          </div>
          <div>
            <p className="eyebrow text-cream-600">Subdomain</p>
            <p className="mt-1 text-base font-medium text-cream-900">{dashboard.tenant.subdomain ?? '—'}</p>
          </div>
          <div>
            <p className="eyebrow text-cream-600">Plan</p>
            <p className="mt-1 text-base font-medium capitalize text-cream-900">{dashboard.tenant.plan ?? '—'}</p>
          </div>
        </div>
      </section>
    </PageWrap>
  );
}
