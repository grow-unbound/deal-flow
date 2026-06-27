'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronRight } from 'lucide-react';

import type { BuyerActivityFeedResponse, BuyerActivityItem, BuyerHomeResponse } from '@/lib/buyer-home-types';
import { apiFetch } from '@/lib/api-fetch';
import { ErrorState } from '@/components/ui/empty-state';
import { BuyerHomeLandingHeader } from '@/components/buyer/layout/BuyerHomeLandingHeader';
import { BuyerNotificationDrawer } from '@/components/buyer/layout/BuyerNotificationDrawer';
import { ActivityCardShell } from '@/components/buyer/orders/ActivityCardShell';
import { RecoSection } from '@/components/buyer/catalog/RecoSection';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useRouteScrollRestoration, useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import type { StatusTone } from '@/components/ui/status-pill';

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${Math.max(diffMins, 1)}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function formatValidUntil(iso: string | null): string {
  if (!iso) return 'No end date';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDueSummary(daysUntilDue: number | null, invoiceCount: number, outstandingDues: number): string {
  if (outstandingDues <= 0 || invoiceCount === 0) return 'No unpaid invoices';
  if (daysUntilDue == null) return `for ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue · ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  if (daysUntilDue === 0) return `due today · ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  return `due in ${daysUntilDue}d · ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
}

function trendLabel(value: number): string {
  if (value > 0) return `+${value}% vs last month`;
  if (value < 0) return `${value}% vs last month`;
  return 'Flat vs last month';
}

function activityStatusTone(status: string): StatusTone {
  switch (status) {
    case 'delivered':
    case 'paid':
      return 'success';
    case 'dispatched':
    case 'pending':
      return 'warning';
    case 'cancelled':
      return 'danger';
    case 'confirmed':
      return 'accent';
    case 'received':
    case 'invoiced':
    case 'open':
    default:
      return 'info';
  }
}

function SectionRow({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-3">
      <h2
        className="leading-none text-[var(--cream-900)]"
        style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-section)', fontWeight: 500, letterSpacing: '-0.005em' }}
      >
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          onClick={() => markBuyerNavigationForward()}
          className="inline-flex items-center gap-1.5 font-medium tracking-[-0.01em] text-[var(--teal-500)] no-underline"
          style={{ fontSize: 'var(--b-text-label)' }}
        >
          {linkLabel ?? 'See all'}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl border border-cream-200 bg-cream-100 ${className}`} />;
}

const promotionHues = [
  'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
  'linear-gradient(135deg, #874720 0%, #C26E3A 100%)',
  'linear-gradient(135deg, #6B6760 0%, #3D3A35 100%)',
];

export default function HomePage() {
  const [notifOpen, setNotifOpen] = useState(false);
  const { unreadCount, setRefreshFn } = useBuyerRealtimeContext();
  const { state, setState } = useRouteSnapshot({
    storageKey: 'buyer-home-page',
    initialState: {
      homeData: null as BuyerHomeResponse | null,
      activityItems: [] as BuyerActivityItem[],
      nextCursor: null as string | null,
    },
  });
  const homeData = state.homeData;
  const activityItems = state.activityItems;
  const nextCursor = state.nextCursor;
  const [loading, setLoading] = useState(!homeData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useRouteScrollRestoration({ storageKey: 'buyer-home-page', ready: !loading });

  async function loadHome() {
    const response = await apiFetch('/api/buyer/home');
    if (!response.ok) throw new Error('Failed to fetch buyer home');
    const payload = await response.json() as BuyerHomeResponse;
    setState((current) => ({
      ...current,
      homeData: payload,
      activityItems: payload.recent_activity.items,
      nextCursor: payload.recent_activity.next_cursor,
    }));
  }

  async function loadMoreActivity() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await apiFetch(`/api/buyer/activity?limit=10&cursor=${encodeURIComponent(nextCursor)}`);
      if (!response.ok) throw new Error('Failed to fetch activity');
      const payload = await response.json() as BuyerActivityFeedResponse;
      setState((current) => ({
        ...current,
        activityItems: [...current.activityItems, ...payload.items],
        nextCursor: payload.next_cursor,
      }));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    setRefreshFn(() => async () => {
      await loadHome();
    });
    return () => setRefreshFn(null);
  }, [setRefreshFn]);

  useEffect(() => {
    let cancelled = false;
    if (homeData) {
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    loadHome()
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [homeData]);

  const { sentinelRef } = useInfiniteScroll({
    hasMore: Boolean(nextCursor),
    isLoading: loadingMore,
    onLoadMore: () => { void loadMoreActivity(); },
  });

  const greetingName = useMemo(() => {
    const raw = homeData?.greeting_name?.trim();
    if (raw) return raw.split(' ')[0];
    if (homeData?.preview_message) return 'Preview';
    return 'there';
  }, [homeData?.greeting_name, homeData?.preview_message]);

  if (loadFailed) {
    return (
      <div className="px-4 py-8">
        <ErrorState
          heading="Couldn't load home"
          description="Check your connection and try again."
          onRetry={() => {
            setLoading(true);
            setLoadFailed(false);
            void loadHome().finally(() => setLoading(false));
          }}
        />
      </div>
    );
  }

  const summary = homeData?.summary_card;
  const dues = homeData?.dues_card;
  const credit = homeData?.credit_card;
  const reorderItems = homeData?.order_again_preview ?? [];
  const promotions = homeData?.latest_promotions_preview ?? [];
  const bestsellers = homeData?.bestsellers ?? [];
  const buyAgain = homeData?.buy_again ?? [];

  return (
    <div className="pb-8">
      <BuyerHomeLandingHeader
        greetingLine={loading ? 'Welcome' : `${getGreeting()}, ${greetingName}`}
        title="Your shelf, this month."
        previewNote={homeData?.preview_message ?? null}
        rightSlot={(
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="relative mt-1.5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--cream-50)] shadow-[0_1px_0_rgba(34,30,26,0.02)]"
            aria-label="Notifications"
          >
            <Bell size={20} strokeWidth={1.55} className="text-[var(--cream-700)]" />
            {unreadCount > 0 ? <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--ember-500)]" /> : null}
          </button>
        )}
      />

      <div className="grid grid-cols-2 gap-2.5 px-3 pt-3">
        <div className="col-span-2 rounded-[24px] bg-[#1f3a33] px-5 py-5 text-[var(--cream-50)] shadow-[0_18px_40px_rgba(31,58,51,0.14)]">
          {loading ? (
            <>
              <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
              <div className="mt-3 h-10 w-44 animate-pulse rounded bg-white/20" />
              <div className="mt-3 h-4 w-40 animate-pulse rounded bg-white/20" />
            </>
          ) : (
            <>
              <p className="font-semibold uppercase tracking-[0.14em] text-white/60" style={{ fontSize: 'var(--b-text-eyebrow)' }}>Spend this year</p>
              <p
                className="mt-3 font-semibold leading-none tracking-[-0.03em] tabular-nums text-white"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-kpi)' }}
              >
                {inr(summary?.gmv_mtd ?? 0)}
              </p>
              <p className="mt-3 font-medium leading-5 tracking-[-0.005em] text-white/70" style={{ fontSize: 'var(--b-text-sub)' }}>
                {trendLabel(summary?.trend_vs_last_month_pct ?? 0)} · {summary?.invoice_count_ytd ?? 0} invoices this year
              </p>
            </>
          )}
        </div>

        <div className="rounded-[22px] border border-[var(--border-1)] bg-[var(--cream-50)] px-4 py-5 shadow-[0_1px_0_rgba(34,30,26,0.03)]">
          {loading ? (
            <>
              <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
            </>
          ) : (
            <>
              <p className="font-semibold uppercase tracking-[0.14em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-eyebrow)' }}>Outstanding dues</p>
              <p
                className="mt-3 font-semibold leading-none tracking-[-0.025em] tabular-nums text-[var(--cream-900)]"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-header)' }}
              >
                {inr(dues?.outstanding_dues ?? 0)}
              </p>
              <p className="mt-3 font-medium leading-5 tracking-[-0.005em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-sub)' }}>
                {formatDueSummary(dues?.days_until_earliest_due ?? null, dues?.open_invoice_count ?? 0, dues?.outstanding_dues ?? 0)}
              </p>
            </>
          )}
        </div>

        <div className="rounded-[22px] border border-[var(--border-1)] bg-[var(--cream-50)] px-4 py-5 shadow-[0_1px_0_rgba(34,30,26,0.03)]">
          {loading ? (
            <>
              <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-8 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-4 w-36 animate-pulse rounded bg-cream-200" />
            </>
          ) : (
            <>
              <p className="font-semibold uppercase tracking-[0.14em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-eyebrow)' }}>Available credit</p>
              <p
                className="mt-3 font-semibold leading-none tracking-[-0.025em] tabular-nums text-[var(--cream-900)]"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-header)' }}
              >
                {inr(credit?.available_credit ?? 0)}
              </p>
              <p className="mt-3 font-medium leading-5 tracking-[-0.005em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-sub)' }}>
                of {inr(credit?.credit_limit ?? 0)} limit
              </p>
            </>
          )}
        </div>
      </div>

      {/* W4 — Buy Again (logged-in buyers with purchase history) */}
      {buyAgain.length > 0 && (
        <div className="pt-10">
          <RecoSection title="Buy Again" widget="buy_again" items={buyAgain} />
        </div>
      )}

      <div className="pt-10">
        <SectionRow title="Order again" href="/buy/buy-again" linkLabel="Browse all" />
        <div className="flex gap-3 overflow-x-auto px-4 pb-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="w-[178px] shrink-0 overflow-hidden rounded-[28px] border border-cream-200 bg-cream-50">
                <div className="h-[220px] animate-pulse bg-cream-100" />
                <div className="space-y-2 px-4 py-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))
          ) : reorderItems.length > 0 ? (
            reorderItems.map((item) => (
              <Link
                key={item.tenant_product_id}
                href={`/buy/product/${item.tenant_product_id}`}
                onClick={() => markBuyerNavigationForward()}
                className="w-[178px] shrink-0 overflow-hidden rounded-[28px] border border-[var(--border-1)] bg-[var(--bg-surface)] no-underline shadow-[0_1px_0_rgba(34,30,26,0.03)]"
              >
                <div
                  className="flex h-[220px] items-center justify-center p-5"
                  style={{
                    background: item.brand_name?.toLowerCase().includes('chenin')
                      ? 'linear-gradient(180deg, #e8f0ec 0%, #dfece8 100%)'
                      : item.brand_name?.toLowerCase().includes('pale')
                        ? 'linear-gradient(180deg, #f7e2c2 0%, #f4d6ab 100%)'
                        : 'linear-gradient(180deg, #f7f3ea 0%, #f3ece0 100%)',
                  }}
                >
                  {item.image_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_urls[0]} alt={item.display_name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="h-40 w-20 rounded-[14px] bg-[var(--teal-900)]" />
                  )}
                </div>
                <div className="bg-white px-4 py-4">
                  <p className="line-clamp-2 text-[var(--b-text-section)] font-semibold leading-7 tracking-[-0.015em] text-[var(--cream-900)]">
                    {item.display_name}
                  </p>
                  <p className="mt-2 font-mono text-[var(--b-text-header)] font-medium tabular-nums text-[var(--cream-900)]">
                    {inr(item.price)} <span className="font-sans text-[var(--cream-700)]">/ unit</span>
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="px-1 text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">No previous orders yet.</p>
          )}
        </div>
      </div>

      {/* W1 — Bestsellers */}
      {bestsellers.length > 0 && (
        <div className="pt-10">
          <RecoSection title="Bestsellers this month" widget="bestsellers" items={bestsellers} />
        </div>
      )}

      <div className="pt-10">
        <SectionRow title="Latest promotions" href="/buy/promotions" linkLabel="See all" />
        <div className="flex gap-3 overflow-x-auto px-4 pb-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="w-[280px] shrink-0 overflow-hidden rounded-[28px] border border-cream-200 bg-cream-50">
                <div className="h-[170px] animate-pulse bg-cream-100" />
                <div className="space-y-2 px-4 py-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))
          ) : promotions.length > 0 ? (
            promotions.map((promotion, index) => (
              <Link
                key={promotion.id}
                href={`/buy/catalog/list/${promotion.id}`}
                onClick={() => markBuyerNavigationForward()}
                className="w-[280px] shrink-0 overflow-hidden rounded-[28px] border border-[var(--border-1)] bg-[var(--bg-surface)] no-underline shadow-[0_1px_0_rgba(34,30,26,0.03)]"
              >
                <div className="flex h-[170px] items-end px-6 py-5" style={{ background: promotionHues[index % promotionHues.length] }}>
                  <h3
                    className="text-[var(--b-text-section)] font-bold leading-none tracking-[-0.02em] text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {promotion.name}
                  </h3>
                </div>
                <div className="flex items-center justify-between bg-white px-6 py-4 text-[var(--b-text-header)] font-medium tracking-[-0.01em] text-[var(--cream-700)]">
                  <span><strong className="font-medium text-[var(--cream-900)]">{promotion.product_count}</strong> products</span>
                  <span>{formatValidUntil(promotion.valid_until)}</span>
                </div>
              </Link>
            ))
          ) : (
            <p className="px-1 text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">No promotions are live right now.</p>
          )}
        </div>
      </div>

      <div className="pt-10">
        <SectionRow title="Recent activity" href="/buy/orders?tab=orders" linkLabel="See orders" />
        <div className="space-y-2 px-4">
          {loading ? (
            <>
              <SkeletonBlock className="h-[88px]" />
              <SkeletonBlock className="h-[88px]" />
              <SkeletonBlock className="h-[88px]" />
            </>
          ) : activityItems.length > 0 ? (
            activityItems.map((item) => (
              <ActivityCardShell
                key={item.id}
                href={item.href}
                onClick={() => markBuyerNavigationForward()}
                documentNumber={item.title}
                statusLabel={String(item.status).replace(/_/g, ' ')}
                statusTone={activityStatusTone(item.status)}
                middleLeft={item.meta ?? item.status}
                middleRight={(
                  <span>
                    {item.secondary_label ? `${item.secondary_label} · ` : ''}
                    <span className="tabular-inline">{formatRelativeTime(item.timestamp)}</span>
                  </span>
                )}
                amount={<span className="tabular-inline font-mono">{inr(item.amount)}</span>}
              />
            ))
          ) : (
            <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">
              No recent activity yet.
            </div>
          )}
          {loadingMore ? <p className="py-2 text-center text-sm text-[var(--cream-500)]">Loading more…</p> : null}
          <div ref={sentinelRef} className="h-2" aria-hidden />
        </div>
      </div>

      <BuyerNotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
