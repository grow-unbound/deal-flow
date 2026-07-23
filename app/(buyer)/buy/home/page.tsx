'use client';

import { formatNumberValue } from '@/lib/utils';
import { Fragment, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';

import type { BuyerHomeResponse } from '@/lib/buyer-home-types';
import { apiFetch } from '@/lib/api-fetch';
import { BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS, BUYER_INFINITE_SCROLL_RATIO } from '@/lib/buyer-ui';
import { ErrorState } from '@/components/ui/empty-state';
import { BuyerHomeLandingHeader } from '@/components/buyer/layout/BuyerHomeLandingHeader';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { ProductCard } from '@/components/buyer/catalog/ProductCard';
import { ActivityCardShell } from '@/components/buyer/orders/ActivityCardShell';
import { BuyerTransactionCardSkeleton } from '@/components/buyer/orders/BuyerTransactionCardSkeleton';
import { RecoSection } from '@/components/buyer/catalog/RecoSection';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useRouteScrollRestoration } from '@/hooks/useRouteSnapshot';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useBuyerActivityInfinite } from '@/hooks/useBuyerActivity';
import type { StatusTone } from '@/components/ui/status-pill';
;

const BuyerNotificationDrawer = dynamic(
  () => import('@/components/buyer/layout/BuyerNotificationDrawer').then((m) => m.BuyerNotificationDrawer),
  { ssr: false },
);

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

function formatDueSummary(daysUntilDue: number | null, invoiceCount: number, outstandingDues: number): string {
  if (outstandingDues <= 0 || invoiceCount === 0) return 'No unpaid invoices';
  if (daysUntilDue == null) return `for ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue · ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  if (daysUntilDue === 0) return `due today · ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
  return `due in ${daysUntilDue}d · ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
}

function activityStatusTone(status: string): StatusTone {
  switch (status) {
    case 'delivered':
    case 'paid':
      return 'success';
    case 'dispatched':
    case 'pending':
    case 'sent':
      return 'warning';
    case 'cancelled':
    case 'void':
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

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse border border-cream-200 bg-cream-100 ${BUYER_CARD_RADIUS_CLASS} ${className}`} />;
}

async function fetchBuyerHome(): Promise<BuyerHomeResponse> {
  const response = await apiFetch('/api/buyer/home');
  if (!response.ok) throw new Error('Failed to fetch buyer home');
  return response.json() as Promise<BuyerHomeResponse>;
}

export default function HomePage() {
  const [notifOpen, setNotifOpen] = useState(false);
  const { unreadCount, setRefreshFn } = useBuyerRealtimeContext();

  const {
    data: homeData,
    isLoading: homeLoading,
    isError: homeError,
    refetch: refetchHome,
  } = useQuery({
    queryKey: ['buyer-home'],
    queryFn: fetchBuyerHome,
    staleTime: 0,
  });

  const {
    data: activityData,
    isLoading: activityLoading,
    isError: activityError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchActivity,
  } = useBuyerActivityInfinite();

  const activityItems = useMemo(
    () => activityData?.pages.flatMap((p) => p.items) ?? [],
    [activityData?.pages],
  );

  const loading = homeLoading || (activityLoading && activityItems.length === 0);
  useRouteScrollRestoration({ storageKey: 'buyer-home-page', ready: !loading });

  const sentinelIndex = getSentinelInsertIndex(activityItems.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    onLoadMore: () => { void fetchNextPage(); },
  });

  useEffect(() => {
    setRefreshFn(async () => {
      await Promise.all([refetchHome(), refetchActivity()]);
    });
    return () => setRefreshFn(null);
  }, [refetchActivity, refetchHome, setRefreshFn]);

  const greetingName = useMemo(() => {
    const raw = homeData?.greeting_name?.trim();
    if (raw) return raw.split(' ')[0];
    if (homeData?.preview_message) return 'Preview';
    return 'there';
  }, [homeData?.greeting_name, homeData?.preview_message]);

  if (homeError) {
    return (
      <div className="px-4 py-8">
        <ErrorState
          heading="Couldn't load home"
          description="Check your connection and try again."
          onRetry={() => { void refetchHome(); }}
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
        <div className={`col-span-2 ${BUYER_CARD_RADIUS_CLASS} bg-[#1f3a33] px-5 py-5 text-[var(--cream-50)] shadow-[0_18px_40px_rgba(31,58,51,0.14)]`}>
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
                {formatNumberValue(summary?.gmv_ytd ?? summary?.gmv_mtd ?? 0, 'CURRENCY_EXACT')}
              </p>
              <p className="mt-3 font-medium leading-5 tracking-[-0.005em] text-white/70" style={{ fontSize: 'var(--b-text-sub)' }}>
                {summary?.invoice_count_ytd ?? 0} invoices this year
              </p>
            </>
          )}
        </div>

        <div className={`${BUYER_CARD_RADIUS_CLASS} border border-[var(--border-1)] bg-[var(--cream-50)] px-4 py-5 shadow-[0_1px_0_rgba(34,30,26,0.03)]`}>
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
                {formatNumberValue(dues?.outstanding_dues ?? 0, 'CURRENCY_EXACT')}
              </p>
              <p className="mt-3 font-medium leading-5 tracking-[-0.005em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-sub)' }}>
                {formatDueSummary(dues?.days_until_earliest_due ?? null, dues?.open_invoice_count ?? 0, dues?.outstanding_dues ?? 0)}
              </p>
            </>
          )}
        </div>

        <div className={`${BUYER_CARD_RADIUS_CLASS} border border-[var(--border-1)] bg-[var(--cream-50)] px-4 py-5 shadow-[0_1px_0_rgba(34,30,26,0.03)]`}>
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
                {formatNumberValue(credit?.available_credit ?? 0, 'CURRENCY_EXACT')}
              </p>
              <p className="mt-3 font-medium leading-5 tracking-[-0.005em] text-[var(--cream-600)]" style={{ fontSize: 'var(--b-text-sub)' }}>
                of {formatNumberValue(credit?.credit_limit ?? 0, 'CURRENCY_EXACT')} limit
              </p>
            </>
          )}
        </div>
      </div>

      <div className="pt-10">
        <BuyerSectionRow title="Promotions" href="/buy/promotions" linkLabel="See all" />
        <BuyerHorizontalScroll className="gap-3 px-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={`w-[280px] shrink-0 overflow-hidden border border-cream-200 bg-cream-50 ${BUYER_CARD_RADIUS_CLASS}`}>
                <div className="buyer-lookbook-preview w-full animate-pulse bg-cream-100" />
                <div className="space-y-2 bg-white px-5 py-4">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))
          ) : promotions.length > 0 ? (
            promotions.map((promotion, index) => (
              <CatalogLookbookCard
                key={promotion.id}
                id={promotion.id}
                name={promotion.name}
                productCount={promotion.product_count}
                href={`/buy/catalog/list/${promotion.id}`}
                validUntil={promotion.valid_until}
                heroImageUrl={promotion.hero_image_url}
                hueIndex={index}
              />
            ))
          ) : (
            <p className="px-1 text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">No promotions are live right now.</p>
          )}
        </BuyerHorizontalScroll>
      </div>

      <div className="pt-10">
        <BuyerSectionRow title="Order again" href="/buy/buy-again" linkLabel="Browse all" />
        <BuyerHorizontalScroll className="gap-3 px-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0 overflow-hidden border border-cream-200 bg-cream-50 ${BUYER_CARD_RADIUS_CLASS}`}>
                <div className="aspect-square animate-pulse bg-cream-100" />
                <div className="space-y-2 px-4 py-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-cream-200" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-cream-200" />
                </div>
              </div>
            ))
          ) : reorderItems.length > 0 ? (
            reorderItems.map((item) => (
              <ProductCard key={item.tenant_product_id} item={item} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0`} />
            ))
          ) : (
            <p className="px-1 text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">No previous orders yet.</p>
          )}
        </BuyerHorizontalScroll>
      </div>

      {bestsellers.length > 0 && (
        <div className="pt-10">
          <RecoSection title="Bestsellers this month" widget="bestsellers" items={bestsellers} />
        </div>
      )}

      <div className="pt-10">
        <BuyerSectionRow title="Recent activity" href="/buy/orders" linkLabel="See all" />
        <div className="space-y-2 px-4">
          {loading ? (
            <>
              <SkeletonBlock className="h-[88px]" />
              <SkeletonBlock className="h-[88px]" />
              <SkeletonBlock className="h-[88px]" />
            </>
          ) : activityError ? (
            <ErrorState
              heading="Couldn't load activity"
              description="Try again in a moment."
              onRetry={() => { void refetchActivity(); }}
            />
          ) : activityItems.length > 0 ? (
            activityItems.map((item, index) => (
              <Fragment key={item.id}>
                <ActivityCardShell
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
                  amount={<span className="tabular-inline font-mono">{formatNumberValue(item.amount, 'CURRENCY_EXACT')}</span>}
                />
                {index === sentinelIndex ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
              </Fragment>
            ))
          ) : (
            <div className="rounded-[12px] border border-[var(--border-1)] bg-white px-4 py-5 text-center text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">
              No recent activity yet.
            </div>
          )}
          {isFetchingNextPage ? <BuyerTransactionCardSkeleton count={2} /> : null}
        </div>
      </div>

      <BuyerNotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
