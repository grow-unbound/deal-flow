'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { getAnalyticsRouteInfo } from '@/lib/analytics-route';
import { useAuth } from '@/contexts/AuthContext';

export function PostHogRouteCapture(): null {
  const posthog = usePostHog();
  const { currentBuyerId, currentTenantId, isLoading, tenantProfile } = useAuth();
  const pathname = usePathname();
  const lastEventKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!posthog || !pathname || isLoading) return;
    const eventKey = `${pathname}:${currentTenantId ?? ''}:${currentBuyerId ?? ''}:${tenantProfile?.role ?? ''}`;
    if (lastEventKeyRef.current === eventKey) return;
    lastEventKeyRef.current = eventKey;

    posthog.capture('$pageview', {
      ...getAnalyticsRouteInfo(pathname),
      tenant_id: currentTenantId,
      buyer_id: currentBuyerId,
      role: tenantProfile?.role ?? null,
    });
  }, [currentBuyerId, currentTenantId, isLoading, pathname, posthog, tenantProfile?.role]);

  return null;
}
