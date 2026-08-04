'use client';

import { formatNumberValue } from '@/lib/utils';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

import type {
  BuyerHomeMetricsV4,
  BuyerHomePromotionsResponse,
  BuyerHomeRecoResponse,
} from '@/lib/buyer-home-types';
import { apiFetch } from '@/lib/api-fetch';
import {
  buyerHomeDemandCountLabel,
  buyerHomeDemandHref,
  buyerHomeDemandTitle,
  buyerHomeOverdueSummary,
  formatBuyerHomeComputedAt,
} from '@/lib/buyer-home-kpi';
import { BUYER_LOOKBOOK_ASPECT_CLASS, BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS, BUYER_INFINITE_SCROLL_RATIO, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import {
  BUYER_QUERY_GC_TIME,
  BUYER_QUERY_STALE_TIME,
  BUYER_REFERENCE_QUERY_GC_TIME,
  BUYER_REFERENCE_QUERY_STALE_TIME,
} from '@/lib/query-navigation';
import { ErrorState } from '@/components/ui/empty-state';
import { BuyerHomeLandingHeader } from '@/components/buyer/layout/BuyerHomeLandingHeader';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { CatalogLookbookCard } from '@/components/buyer/catalog/CatalogLookbookCard';
import { ProductCard } from '@/components/buyer/catalog/ProductCard';
import { ActivityCardShell } from '@/components/buyer/orders/ActivityCardShell';
import { BuyerTransactionCardSkeleton } from '@/components/buyer/orders/BuyerTransactionCardSkeleton';
import { getSentinelInsertIndex, useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useRouteScrollRestoration } from '@/hooks/useRouteSnapshot';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerRealtimeContext } from '@/contexts/BuyerRealtimeContext';
import { useBuyerActivityInfinite } from '@/hooks/useBuyerActivity';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { RecoWidgetProvider } from '@/contexts/RecoWidgetContext';
import type { StatusTone } from '@/components/ui/status-pill';

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

function KpiTileSkeleton({ dark = false }: { dark?: boolean }) {
  const bar = dark ? 'bg-white/20' : 'bg-cream-200';
  return (
    <>
      <div className={`h-3 w-24 animate-pulse rounded ${bar}`} />
      <div className={`mt-3 ${dark ? 'h-10' : 'h-8'} w-28 animate-pulse rounded ${bar}`} />
      <div className={`mt-3 h-4 w-36 animate-pulse rounded ${bar}`} />
    </>
  );
}

function PromotionCarouselSkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`w-[280px] shrink-0 overflow-hidden border border-cream-200 bg-cream-50 ${BUYER_CARD_RADIUS_CLASS}`}
        >
          <div className={`buyer-lookbook-preview w-full animate-pulse bg-cream-100 ${BUYER_LOOKBOOK_ASPECT_CLASS}`} />
          <div className="space-y-2 bg-white px-5 py-4">
            <div className={`${BUYER_TWO_LINE_TITLE_CLASS} min-h-[2.4em] animate-pulse rounded bg-cream-200`} />
            <div className="h-4 w-full animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </>
  );
}

function ProductCarouselSkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0 overflow-hidden border border-cream-200 bg-cream-50 ${BUYER_CARD_RADIUS_CLASS}`}
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="bg-[var(--cream-50)] px-3 pb-3 pt-2.5">
            <div className={`${BUYER_TWO_LINE_TITLE_CLASS} min-h-[2.4em] animate-pulse rounded bg-cream-200`} />
            <div className="mt-0.5 h-3.5 w-2/5 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-5 w-24 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </>
  );
}

function KpiCard({
  href,
  title,
  value,
  supporting,
  dark = false,
}: {
  href: string;
  title: string;
  value: string;
  supporting: string;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={() => markBuyerNavigationForward()}
      className={`block ${BUYER_CARD_RADIUS_CLASS} px-4 py-5 shadow-[0_1px_0_rgba(34,30,26,0.03)] ${
        dark
          ? 'bg-[#1f3a33] text-[var(--cream-50)] shadow-[0_18px_40px_rgba(31,58,51,0.14)]'
          : 'border border-[var(--border-1)] bg-[var(--cream-50)]'
      }`}
    >
      <p
        className={`font-semibold uppercase tracking-[0.14em] ${dark ? 'text-white/60' : 'text-[var(--cream-600)]'}`}
        style={{ fontSize: 'var(--b-text-eyebrow)' }}
      >
        {title}
      </p>
      <p
        className={`mt-3 font-semibold leading-none tracking-[-0.025em] tabular-nums ${dark ? 'text-white' : 'text-[var(--cream-900)]'}`}
        style={{ fontFamily: 'var(--font-display)', fontSize: dark ? 'var(--b-text-kpi)' : 'var(--b-text-header)' }}
      >
        {value}
      </p>
      <p
        className={`mt-3 font-medium leading-5 tracking-[-0.005em] ${dark ? 'text-white/70' : 'text-[var(--cream-600)]'}`}
        style={{ fontSize: 'var(--b-text-sub)' }}
      >
        {supporting}
      </p>
    </Link>
  );
}

async function fetchBuyerHomeMetrics(): Promise<BuyerHomeMetricsV4> {
  const response = await apiFetch('/api/buyer/home/metrics');
  if (!response.ok) throw new Error('Failed to fetch buyer home metrics');
  return response.json() as Promise<BuyerHomeMetricsV4>;
}

async function fetchBuyerHomePromotions(): Promise<BuyerHomePromotionsResponse> {
  const response = await apiFetch('/api/buyer/home/promotions');
  if (!response.ok) throw new Error('Failed to fetch buyer home promotions');
  return response.json() as Promise<BuyerHomePromotionsResponse>;
}

async function fetchBuyerHomeReco(): Promise<BuyerHomeRecoResponse> {
  const response = await apiFetch('/api/buyer/home/reco');
  if (!response.ok) throw new Error('Failed to fetch buyer home reco');
  return response.json() as Promise<BuyerHomeRecoResponse>;
}

export default function HomePage() {
  const [notifOpen, setNotifOpen] = useState(false);
  const posthog = usePostHog();
  const bestsellerImpressionKey = useRef<string | null>(null);
  const { unreadCount, setRefreshFn } = useBuyerRealtimeContext();
  const { data: buyerMe } = useBuyerMe();

  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['buyer-home-metrics'],
    queryFn: fetchBuyerHomeMetrics,
    staleTime: BUYER_QUERY_STALE_TIME,
    gcTime: BUYER_QUERY_GC_TIME,
  });

  const {
    data: promotionsData,
    isLoading: promotionsLoading,
    refetch: refetchPromotions,
  } = useQuery({
    queryKey: ['buyer-home-promotions'],
    queryFn: fetchBuyerHomePromotions,
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
  });

  const {
    data: recoData,
    isLoading: recoLoading,
    refetch: refetchReco,
  } = useQuery({
    queryKey: ['buyer-home-reco'],
    queryFn: fetchBuyerHomeReco,
    staleTime: BUYER_REFERENCE_QUERY_STALE_TIME,
    gcTime: BUYER_REFERENCE_QUERY_GC_TIME,
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

  const headerReady = Boolean(buyerMe) || metrics !== undefined;
  useRouteScrollRestoration({ storageKey: 'buyer-home-page', ready: headerReady });

  const sentinelIndex = getSentinelInsertIndex(activityItems.length, BUYER_INFINITE_SCROLL_RATIO);
  const { sentinelRef } = useInfiniteScroll({
    hasMore: hasNextPage ?? false,
    isLoading: isFetchingNextPage,
    onLoadMore: () => { void fetchNextPage(); },
  });

  useEffect(() => {
    setRefreshFn(async () => {
      await Promise.all([
        refetchMetrics(),
        refetchPromotions(),
        refetchReco(),
        refetchActivity(),
      ]);
    });
    return () => setRefreshFn(null);
  }, [refetchActivity, refetchMetrics, refetchPromotions, refetchReco, setRefreshFn]);

  const greetingName = useMemo(() => {
    const raw = buyerMe?.greeting_name?.trim() ?? buyerMe?.contact_name?.trim();
    if (raw) return raw.split(' ')[0];
    if (promotionsData?.preview_message || recoData?.preview_message) return 'Preview';
    return 'there';
  }, [buyerMe?.contact_name, buyerMe?.greeting_name, promotionsData?.preview_message, recoData?.preview_message]);

  const previewNote = promotionsData?.preview_message ?? recoData?.preview_message ?? null;
  const promotions = promotionsData?.latest_promotions_preview ?? [];
  const reorderItems = recoData?.order_again_preview ?? [];
  const bestsellers = recoData?.bestsellers ?? [];
  const computedAtLabel = formatBuyerHomeComputedAt(metrics?.computed_at);
  const demandKind = metrics?.demand_kind;
  // Skeletons only on cold cache — never replace already-rendered sections during refetch.
  const showMetricsSkeleton = metricsLoading && !metrics;
  const showPromotionsSkeleton = promotionsLoading && !promotionsData;
  const showRecoSkeleton = recoLoading && !recoData;

  useEffect(() => {
    if (showRecoSkeleton || bestsellers.length === 0) return;
    const impressionKey = `bestsellers:${bestsellers.length}`;
    if (bestsellerImpressionKey.current === impressionKey) return;
    bestsellerImpressionKey.current = impressionKey;
    posthog?.capture('reco_widget_shown', {
      widget: 'bestsellers',
      result_count: bestsellers.length,
    });
  }, [bestsellers.length, posthog, showRecoSkeleton]);

  if (metricsError) {
    return (
      <div className="px-4 py-8">
        <ErrorState
          heading="Couldn't load home"
          description="Check your connection and try again."
          onRetry={() => { void refetchMetrics(); }}
        />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <BuyerHomeLandingHeader
        greetingLine={!headerReady ? 'Welcome' : `${getGreeting()}, ${greetingName}`}
        title="Your shelf, this quarter."
        previewNote={previewNote}
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
        {showMetricsSkeleton ? (
          <>
            <div className={`col-span-1 ${BUYER_CARD_RADIUS_CLASS} bg-[#1f3a33] px-4 py-5`}>
              <KpiTileSkeleton dark />
            </div>
            <div className={`col-span-1 ${BUYER_CARD_RADIUS_CLASS} bg-[#1f3a33] px-4 py-5`}>
              <KpiTileSkeleton dark />
            </div>
            <div className={`col-span-1 ${BUYER_CARD_RADIUS_CLASS} border border-cream-200 bg-cream-50 px-4 py-5`}>
              <KpiTileSkeleton />
            </div>
            <div className={`col-span-1 ${BUYER_CARD_RADIUS_CLASS} border border-cream-200 bg-cream-50 px-4 py-5`}>
              <KpiTileSkeleton />
            </div>
            <div className="col-span-2 h-4 w-40 animate-pulse rounded bg-cream-200" />
          </>
        ) : (
          <>
            <KpiCard
              href="/buy/orders?tab=invoices"
              title="Spend this quarter"
              value={formatNumberValue(metrics?.spend_qtd ?? 0, 'CURRENCY_EXACT')}
              supporting={`${metrics?.invoice_count_qtd ?? 0} invoices`}
              dark
            />
            <KpiCard
              href={buyerHomeDemandHref(demandKind)}
              title={buyerHomeDemandTitle(demandKind)}
              value={formatNumberValue(metrics?.demand_qtd ?? 0, 'CURRENCY_EXACT')}
              supporting={buyerHomeDemandCountLabel(demandKind, metrics?.demand_document_count_qtd ?? 0)}
              dark
            />
            <KpiCard
              href="/buy/orders?tab=invoices&status=Due"
              title="Outstanding"
              value={formatNumberValue(metrics?.outstanding ?? 0, 'CURRENCY_EXACT')}
              supporting={
                (metrics?.overdue ?? 0) > 0
                  ? `${formatNumberValue(metrics?.overdue ?? 0, 'CURRENCY_EXACT')} overdue`
                  : buyerHomeOverdueSummary(metrics?.outstanding ?? 0, metrics?.overdue ?? 0)
              }
            />
            <KpiCard
              href="/buy/orders?tab=invoices&status=Due"
              title="Available credit"
              value={formatNumberValue(metrics?.available_credit ?? 0, 'CURRENCY_EXACT')}
              supporting={`of ${formatNumberValue(metrics?.credit_limit ?? 0, 'CURRENCY_EXACT')} limit`}
            />
            {computedAtLabel ? (
              <p className="col-span-2 px-1 text-[var(--b-text-sub)] font-medium text-[var(--cream-600)]">
                as of {computedAtLabel}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="pt-10">
        <BuyerSectionRow title="Promotions" href="/buy/promotions" linkLabel="See all" />
        <BuyerHorizontalScroll className="gap-3 px-4">
          {showPromotionsSkeleton ? (
            <PromotionCarouselSkeletonCards />
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
                priority={index === 0}
              />
            ))
          ) : (
            <p className="px-1 text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">No promotions are live right now.</p>
          )}
        </BuyerHorizontalScroll>
      </div>

      <div className="pt-10">
        <BuyerSectionRow title="Order again" />
        <BuyerHorizontalScroll className="gap-3 px-4">
          {showRecoSkeleton ? (
            <ProductCarouselSkeletonCards />
          ) : reorderItems.length > 0 ? (
            reorderItems.map((item) => (
              <ProductCard key={item.tenant_product_id} item={item} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0`} />
            ))
          ) : (
            <p className="px-1 text-[var(--b-text-body)] font-medium tracking-[-0.01em] text-[var(--cream-600)]">No previous orders yet.</p>
          )}
        </BuyerHorizontalScroll>
      </div>

      {showRecoSkeleton || bestsellers.length > 0 ? (
        <div className="pt-10">
          <BuyerSectionRow title="Bestsellers" />
          <BuyerHorizontalScroll className="gap-3 px-4">
            {showRecoSkeleton ? (
              <ProductCarouselSkeletonCards />
            ) : (
              <RecoWidgetProvider value={{ widget: 'bestsellers' }}>
                {bestsellers.map((item) => (
                  <ProductCard key={item.tenant_product_id} item={item} className={`${BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS} shrink-0`} />
                ))}
              </RecoWidgetProvider>
            )}
          </BuyerHorizontalScroll>
        </div>
      ) : null}

      <div className="pt-10">
        <BuyerSectionRow title="Recent activity" href="/buy/orders" linkLabel="See all" />
        <div className="space-y-2 px-4">
          {activityLoading && activityItems.length === 0 ? (
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
