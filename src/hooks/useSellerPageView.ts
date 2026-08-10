'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';

import { getAnalyticsRouteInfo } from '@/lib/analytics-route';
import { useSellerAnalyticsIds } from '@/lib/analytics-identity';

function getSellerLandingEntityType(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const sellerIndex = segments[0] === 'seller' ? 1 : 0;
  return segments[sellerIndex] ?? 'unknown';
}

/** Fires `seller_page_viewed` once per pathname mount — drop into every seller landing/detail page. */
export function useSellerPageView(): void {
  const posthog = usePostHog();
  const pathname = usePathname();
  const analyticsIds = useSellerAnalyticsIds();
  const routeInfo = useMemo(() => getAnalyticsRouteInfo(pathname), [pathname]);
  const entityType = useMemo(() => getSellerLandingEntityType(pathname), [pathname]);
  const viewedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (viewedKeyRef.current === pathname) return;
    viewedKeyRef.current = pathname;
    posthog?.capture('seller_page_viewed', {
      ...routeInfo,
      ...analyticsIds,
      entity_type: entityType,
    });
  }, [posthog, pathname, routeInfo, analyticsIds, entityType]);
}

/** Capture a primary CTA click (create/save/delete) on a seller landing/detail page. */
export function useSellerCtaCapture() {
  const posthog = usePostHog();
  const pathname = usePathname();
  const analyticsIds = useSellerAnalyticsIds();
  const routeInfo = useMemo(() => getAnalyticsRouteInfo(pathname), [pathname]);
  const entityType = useMemo(() => getSellerLandingEntityType(pathname), [pathname]);

  return (ctaId: string, extra?: Record<string, unknown>) => {
    posthog?.capture('seller_landing_cta_clicked', {
      ...routeInfo,
      ...analyticsIds,
      entity_type: entityType,
      cta_id: ctaId,
      ...extra,
    });
  };
}
