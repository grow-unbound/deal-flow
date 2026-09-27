import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  buildBuyerAnalyticsProperties,
  normalizeBuyerSearchQuery,
  postHogCorrelationHeaders,
} from '@/lib/buyer-analytics';

describe('buyer analytics contract', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://wineyard.localhost:3000/buy/search?utm_source=wa&utm_medium=chat&campaign_id=cat-1'),
    });
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://google.com/search?q=camera',
    });
  });

  it('normalizes safe search terms and redacts likely PII', () => {
    expect(normalizeBuyerSearchQuery('  Dome   Camera  ')).toEqual({
      normalized_query: 'dome camera',
      query_length: 11,
      query_redacted: false,
      query_redaction_reason: null,
    });
    expect(normalizeBuyerSearchQuery('buyer@example.com')).toMatchObject({
      normalized_query: null,
      query_redacted: true,
      query_redaction_reason: 'email',
    });
    expect(normalizeBuyerSearchQuery('27ABCDE1234F1Z5')).toMatchObject({
      normalized_query: null,
      query_redacted: true,
      query_redaction_reason: 'gstin',
    });
    expect(normalizeBuyerSearchQuery('9876543210')).toMatchObject({
      normalized_query: null,
      query_redacted: true,
      query_redaction_reason: 'phone',
    });
  });

  it('builds tenant and storefront attribution from buyer profile and url context', () => {
    const posthog = {
      get_distinct_id: vi.fn(() => 'ph-distinct'),
      get_session_id: vi.fn(() => 'ph-session'),
    };
    expect(buildBuyerAnalyticsProperties({
      surface: 'catalog_landing',
      pathname: '/buy/search',
      posthog: posthog as any,
      me: {
        mode: 'guest',
        buyer_id: 'guest',
        tenant: { id: 'tenant-1', slug: 'wineyard', name: 'Wineyard', logo_url: null, outlets: [] },
      } as any,
    })).toMatchObject({
      tenant_id: 'tenant-1',
      tenant_slug: 'wineyard',
      buyer_id: null,
      source_channel: 'storefront',
      share_id: 'cat-1',
      utm_source: 'wa',
      utm_medium: 'chat',
      referrer_class: 'campaign',
      surface: 'catalog_landing',
      route_path: '/buy/search',
      posthog_distinct_id: 'ph-distinct',
      posthog_session_id: 'ph-session',
    });
  });

  it('returns correlation headers only when PostHog ids exist', () => {
    expect(postHogCorrelationHeaders({
      get_distinct_id: () => 'distinct-1',
      get_session_id: () => 'session-1',
    } as any)).toEqual({
      'X-POSTHOG-DISTINCT-ID': 'distinct-1',
      'X-POSTHOG-SESSION-ID': 'session-1',
    });
    expect(postHogCorrelationHeaders(null)).toEqual({});
  });
});
