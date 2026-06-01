import { useFeatureFlagEnabled, useFeatureFlagVariantKey, usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { FEATURE_FLAGS } from '@/constants';

export type FlagState = boolean | undefined;

/**
 * Tri-state flag hook.
 * - `true` / `false` when PostHog flag is resolved
 * - `undefined` while flags are still loading
 */
export function useFlagState(flagKey: keyof typeof FEATURE_FLAGS): FlagState {
  return useFeatureFlagEnabled(FEATURE_FLAGS[flagKey]);
}

/**
 * Returns a boolean directly — reactive to PostHog flag state.
 * Use this for simple flag-on/off checks in components.
 */
export function useFlag(flagKey: keyof typeof FEATURE_FLAGS): boolean {
  return useFlagState(flagKey) === true;
}

/**
 * Hook to check if a feature flag is enabled
 * Supports per-tenant overrides via tenant_id in PostHog
 */
export function useFeatureFlag(flagKey: keyof typeof FEATURE_FLAGS) {
  const enabled = !!useFeatureFlagEnabled(FEATURE_FLAGS[flagKey]);

  return useCallback((): boolean => {
    return enabled;
  }, [enabled]);
}

/**
 * Hook to get the value of a multivariate feature flag
 * Useful for staged rollouts, A/B tests
 */
export function useFeatureFlagVariant(flagKey: keyof typeof FEATURE_FLAGS) {
  const variant = useFeatureFlagVariantKey(FEATURE_FLAGS[flagKey]);
  const enabled = !!useFeatureFlagEnabled(FEATURE_FLAGS[flagKey]);

  return useCallback((): string | boolean | undefined => {
    return variant ?? enabled;
  }, [enabled, variant]);
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
