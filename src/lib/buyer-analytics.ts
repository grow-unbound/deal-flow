'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import type { PostHog } from 'posthog-js';
import { useBuyerMe, type BuyerMeData } from '@/hooks/useBuyerMe';
import { parseRequestHost } from '@/lib/storefront-host';

const MAX_SEARCH_QUERY_LENGTH = 80;

export type BuyerAnalyticsProperties = {
  tenant_id: string | null;
  tenant_slug: string | null;
  buyer_id: string | null;
  source_channel: 'storefront';
  share_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_class: 'direct' | 'internal' | 'search' | 'social' | 'campaign' | 'external';
  surface: string;
  route_path: string;
  posthog_distinct_id: string | null;
  posthog_session_id: string | null;
};

export type NormalizedSearchQuery = {
  normalized_query: string | null;
  query_length: number;
  query_redacted: boolean;
  query_redaction_reason: 'email' | 'phone' | 'gstin' | 'address' | 'too_short' | null;
};

function currentUrl(): URL | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function classifyReferrer(url: URL | null): BuyerAnalyticsProperties['referrer_class'] {
  if (!url) return 'direct';
  const hasCampaign = ['utm_source', 'utm_medium', 'utm_campaign', 'share_id', 'share', 'campaign_id']
    .some((key) => Boolean(url.searchParams.get(key)));
  if (hasCampaign) return 'campaign';
  if (typeof document === 'undefined' || !document.referrer) return 'direct';

  try {
    const referrer = new URL(document.referrer);
    if (referrer.hostname === url.hostname) return 'internal';
    if (/(^|\.)google\.|(^|\.)bing\.|(^|\.)duckduckgo\.|(^|\.)yahoo\./i.test(referrer.hostname)) return 'search';
    if (/(^|\.)facebook\.|(^|\.)instagram\.|(^|\.)linkedin\.|(^|\.)x\.com$|(^|\.)twitter\./i.test(referrer.hostname)) return 'social';
    return 'external';
  } catch {
    return 'external';
  }
}

function tenantSlugFromHost(url: URL | null): string | null {
  if (!url) return null;
  const host = parseRequestHost(url.host);
  return host.kind === 'tenant' ? host.slug : null;
}

export function normalizeBuyerSearchQuery(raw: string): NormalizedSearchQuery {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_QUERY_LENGTH);
  if (normalized.length < 2) {
    return {
      normalized_query: null,
      query_length: normalized.length,
      query_redacted: true,
      query_redaction_reason: 'too_short',
    };
  }
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(normalized)) {
    return { normalized_query: null, query_length: normalized.length, query_redacted: true, query_redaction_reason: 'email' };
  }
  if (/\b\d{2}[a-z]{5}\d{4}[a-z][1-9a-z]z[0-9a-z]\b/i.test(normalized)) {
    return { normalized_query: null, query_length: normalized.length, query_redacted: true, query_redaction_reason: 'gstin' };
  }
  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 8 || /\b\d{6}\b/.test(normalized)) {
    return { normalized_query: null, query_length: normalized.length, query_redacted: true, query_redaction_reason: 'phone' };
  }
  if (/\b(flat|floor|house|building|apartment|address|street|road|colony|sector|phase|pincode)\b/i.test(normalized)) {
    return { normalized_query: null, query_length: normalized.length, query_redacted: true, query_redaction_reason: 'address' };
  }
  return {
    normalized_query: normalized,
    query_length: normalized.length,
    query_redacted: false,
    query_redaction_reason: null,
  };
}

export function buildBuyerAnalyticsProperties(params: {
  me?: BuyerMeData | null;
  pathname?: string | null;
  posthog?: PostHog | null;
  surface: string;
}): BuyerAnalyticsProperties {
  const url = currentUrl();
  const tenant = params.me?.tenant;
  const mode = params.me?.mode;
  const buyerId = mode === 'buyer' || mode === 'pending' ? params.me?.buyer_id ?? null : null;
  const shareId = url?.searchParams.get('share_id')
    ?? url?.searchParams.get('share')
    ?? url?.searchParams.get('campaign_id')
    ?? url?.searchParams.get('list_id')
    ?? null;

  return {
    tenant_id: tenant?.id ?? null,
    tenant_slug: tenant?.slug ?? tenantSlugFromHost(url),
    buyer_id: buyerId,
    source_channel: 'storefront',
    share_id: shareId,
    utm_source: url?.searchParams.get('utm_source') ?? null,
    utm_medium: url?.searchParams.get('utm_medium') ?? null,
    utm_campaign: url?.searchParams.get('utm_campaign') ?? null,
    referrer_class: classifyReferrer(url),
    surface: params.surface,
    route_path: params.pathname ?? url?.pathname ?? '',
    posthog_distinct_id: params.posthog?.get_distinct_id?.() ?? null,
    posthog_session_id: params.posthog?.get_session_id?.() ?? null,
  };
}

export function useBuyerAnalyticsProperties(options: { enabled?: boolean } = {}) {
  const posthog = usePostHog();
  const pathname = usePathname();
  const { data: me } = useBuyerMe({ enabled: options.enabled ?? true });

  return useCallback(
    (surface: string) => buildBuyerAnalyticsProperties({ me, pathname, posthog, surface }),
    [me, pathname, posthog],
  );
}

export function postHogCorrelationHeaders(posthog: PostHog | null | undefined): Record<string, string> {
  const distinctId = posthog?.get_distinct_id?.();
  const sessionId = posthog?.get_session_id?.();
  return {
    ...(distinctId ? { 'X-POSTHOG-DISTINCT-ID': distinctId } : {}),
    ...(sessionId ? { 'X-POSTHOG-SESSION-ID': sessionId } : {}),
  };
}
