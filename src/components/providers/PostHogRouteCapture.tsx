'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { getAnalyticsRouteInfo } from '@/lib/analytics-route';
import { useAuth } from '@/contexts/AuthContext';
import { useBuyerAnalyticsProperties } from '@/lib/buyer-analytics';

export function PostHogRouteCapture(): null {
  const posthog = usePostHog();
  const { currentBuyerId, currentTenantId, isLoading, tenantProfile } = useAuth();
  const pathname = usePathname();
  const isBuyerRoute = pathname?.startsWith('/buy') === true || pathname?.startsWith('/catalog') === true;
  const buyerAnalytics = useBuyerAnalyticsProperties({ enabled: isBuyerRoute });
  const lastEventKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!posthog || !pathname || isLoading) return;
    const eventKey = `${pathname}:${currentTenantId ?? ''}:${currentBuyerId ?? ''}:${tenantProfile?.role ?? ''}`;
    if (lastEventKeyRef.current === eventKey) return;
    lastEventKeyRef.current = eventKey;

    const buyerProperties = isBuyerRoute ? buyerAnalytics('buyer_page') : {};
    posthog.capture('$pageview', {
      ...getAnalyticsRouteInfo(pathname),
      ...buyerProperties,
      tenant_id: isBuyerRoute ? (buyerProperties as { tenant_id?: string | null }).tenant_id ?? currentTenantId : currentTenantId,
      buyer_id: isBuyerRoute ? (buyerProperties as { buyer_id?: string | null }).buyer_id ?? currentBuyerId : currentBuyerId,
      role: tenantProfile?.role ?? null,
    });
  }, [buyerAnalytics, currentBuyerId, currentTenantId, isBuyerRoute, isLoading, pathname, posthog, tenantProfile?.role]);

  return null;
}
