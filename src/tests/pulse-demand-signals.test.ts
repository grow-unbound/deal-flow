import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { captureAuthoritativeBuyerDemand } from '@/lib/server/buyer-posthog-events';
import {
  buildPulseDemandSignalsSnapshot,
  demandSignalsResponseFromSnapshot,
  parsePulseDemandSignalsSnapshot,
} from '@/lib/server/pulse-demand-signals';

const captureMock = vi.fn();
const flushMock = vi.fn(() => Promise.resolve());

vi.mock('@/lib/posthog-server', () => ({
  getPostHogClient: () => ({
    capture: captureMock,
    flush: flushMock,
  }),
}));

describe('Pulse demand signals snapshot contract', () => {
  beforeEach(() => {
    captureMock.mockClear();
    flushMock.mockClear();
    vi.useRealTimers();
  });

  it('maps landing snapshot cards into the compact demand-signals response', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T03:00:00.000Z'));

    const parsed = parsePulseDemandSignalsSnapshot({
      computed_at: '2026-09-22T02:10:00.000Z',
      source_watermark: '2026-09-22T02:00:00.000Z',
      cards: [
        {
          id: 'missing_assortment',
          rows: [{ id: 'dome camera', label: 'dome camera', count: 5, unique_count: 3, source_channel: 'storefront' }],
          meta: {
            searches: 9,
            zero_result_searches: 5,
            product_views: 30,
            cart_adds: 4,
            query_window_start: '2026-09-15T00:00:00.000Z',
            query_window_end: '2026-09-22T00:00:00.000Z',
          },
        },
        {
          id: 'conversion_gaps',
          rows: [{ id: 'product-1', label: 'NVR', count: 12, unique_count: 4, source_channel: 'storefront' }],
        },
      ],
    });

    expect(parsed.missing_assortment).toHaveLength(1);
    expect(parsed.conversion_gaps).toHaveLength(1);
    expect(parsed.stock_mismatch).toEqual([]);
    expect(parsed.funnel_counts).toEqual({
      searches: 9,
      zero_result_searches: 5,
      product_views: 30,
      cart_adds: 4,
    });
    expect(parsed.stale).toBe(false);
    expect(demandSignalsResponseFromSnapshot({ cards: [] }).page_key).toBe('pulse_demand_signals');
  });

  it('marks old demand-signal snapshots stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T16:00:00.000Z'));

    const parsed = parsePulseDemandSignalsSnapshot({
      computed_at: '2026-09-22T02:10:00.000Z',
      source_watermark: '2026-09-22T02:00:00.000Z',
      cards: [],
    });

    expect(parsed.stale).toBe(true);
  });

  it('captures authoritative buyer demand with browser correlation ids', () => {
    const request = new NextRequest('https://wineyard.localhost/api/buyer/orders', {
      headers: {
        'x-posthog-distinct-id': 'browser-distinct',
        'x-posthog-session-id': 'session-1',
      },
    });
    captureAuthoritativeBuyerDemand({
      request,
      event: 'order_placed',
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      documentId: 'order-1',
      documentNumber: 'SO-1',
      documentType: 'order',
      totalAmount: 1250,
      itemCount: 2,
      lineProductIds: ['product-1', 'product-2'],
      campaignId: 'catalog-1',
    });

    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: 'browser-distinct',
      event: 'order_placed',
      properties: expect.objectContaining({
        tenant_id: 'tenant-1',
        buyer_id: 'buyer-1',
        document_id: 'order-1',
        source_channel: 'storefront',
        line_product_ids: ['product-1', 'product-2'],
        posthog_distinct_id: 'browser-distinct',
        posthog_session_id: 'session-1',
      }),
    }));
  });

  it('posts HogQL in the query object without unsupported top-level variables', async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '123';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    const db = {
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    await buildPulseDemandSignalsSnapshot(
      db as any,
      'd601c35c-1a78-4506-a556-a82118d72893',
      new Date('2026-09-24T00:00:00.000Z'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.variables).toBeUndefined();
    expect(body.query.kind).toBe('HogQLQuery');
    expect(body.query.query).toContain("properties.tenant_id = 'd601c35c-1a78-4506-a556-a82118d72893'");
    expect(body.query.query).toContain("timestamp >= toDateTime('2026-09-17T00:00:00.000Z')");
    expect(body.query.query).toContain('LIMIT 5');

    fetchMock.mockRestore();
  });
});
