import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { FEATURE_FLAGS } from '@/constants';

/**
 * Hook to check if a feature flag is enabled
 * Supports per-tenant overrides via tenant_id in PostHog
 */
export function useFeatureFlag(flagKey: keyof typeof FEATURE_FLAGS) {
  const posthog = usePostHog();

  return useCallback((): boolean => {
    if (!posthog) return false;

    const flag = posthog.getFeatureFlag(FEATURE_FLAGS[flagKey]);
    return flag === true;
  }, [posthog, flagKey]);
}

/**
 * Hook to get the value of a multivariate feature flag
 * Useful for staged rollouts, A/B tests
 */
export function useFeatureFlagVariant(flagKey: keyof typeof FEATURE_FLAGS) {
  const posthog = usePostHog();

  return useCallback((): string | boolean | undefined => {
    if (!posthog) return undefined;

    return posthog.getFeatureFlag(FEATURE_FLAGS[flagKey]);
  }, [posthog, flagKey]);
}

/**
 * Hook to identify user for PostHog tracking
 * Call this after authentication with tenant context
 */
export function useIdentifyUser(userId: string, tenantId?: string, role?: string) {
  const posthog = usePostHog();

  return useCallback((): void => {
    if (!posthog || !userId) return;

    posthog.identify(userId, {
      tenant_id: tenantId,
      role: role,
    });
  }, [posthog, userId, tenantId, role]);
}

/**
 * Hook to capture events for product analytics
 * Examples: feature_used, order_placed, catalog_published
 */
export function useCaptureEvent() {
  const posthog = usePostHog();

  return useCallback(
    (eventName: string, properties?: Record<string, any>): void => {
      if (!posthog) return;

      posthog.capture(eventName, properties);
    },
    [posthog]
  );
}

/**
 * Hook to track page views
 */
export function usePageView() {
  const posthog = usePostHog();

  return useCallback((pageName: string): void => {
    if (!posthog) return;

    posthog.capture('$pageview', {
      page_name: pageName,
    });
  }, [posthog]);
}
