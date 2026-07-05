import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

import { createZohoAdapter, getZohoPhasePlan } from '../../../supabase/functions/_shared/integrations-zoho';

describe('zoho transactional sync windowing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps estimates, orders, and invoices in the transactional phase plan', () => {
    const phaseIds = getZohoPhasePlan('zoho_books', 'transactional').map((phase) => phase.id);

    expect(phaseIds).toEqual(['estimates', 'orders', 'invoices']);
  });

  it('runs transaction line-item hydration after invoices in the orchestrator transaction group', () => {
    const source = readFileSync('supabase/functions/integrations-sync/index.ts', 'utf8');

    expect(source).toContain("transactional: ['estimates', 'orders', 'invoices', 'transaction_line_items']");
    expect(source).toContain("opts.phase === 'transaction_line_items'");
    expect(source).toContain("'sync-transaction-line-items'");
    expect(source).toContain('resolvePhaseSince');
    expect(source).toContain('since: phaseSince');
    expect(source).toContain('sync_run_id');
    expect(source).toContain("dependsOnPhase: phase === 'transaction_line_items' ? 'invoices' : null");
  });

  it('scopes line-item hydration to the same transaction date window', () => {
    const source = readFileSync('supabase/functions/sync-transaction-line-items/index.ts', 'utf8');

    expect(source).toContain("since_date: opts.sinceDate ?? null");
    expect(source).toContain("query.gte(dateColumn, sinceDate)");
    expect(source).toContain("estimate_date");
    expect(source).toContain("placed_at");
    expect(source).toContain("invoice_date");
  });

  it.each([
    ['estimates', 'estimates'],
    ['orders', 'salesorders'],
    ['invoices', 'invoices'],
  ] as const)('passes the selected since window through to %s sync requests', async (phaseId, itemKey) => {
    const seenUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      seenUrls.push(url);

      if (url.pathname.includes('/oauth/v2/token')) {
        return new Response(JSON.stringify({ access_token: 'token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        [itemKey]: [],
        page_context: { has_more_page: false },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const adapter = createZohoAdapter('zoho_books', {
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
      organization_id: 'org-1',
      accounts_base_url: 'https://accounts.zoho.in',
      api_base_url: 'https://www.zohoapis.in/books/v3',
    });

    const phase = getZohoPhasePlan('zoho_books', 'transactional').find((entry) => entry.id === phaseId);
    expect(phase).toBeTruthy();
    if (!phase) return;

    await adapter.fetchPhasePage(phase, null, '2026-06-01');

    const dataRequest = seenUrls.find((url) => !url.pathname.includes('/oauth/v2/token'));
    expect(dataRequest).toBeTruthy();
    expect(dataRequest?.searchParams.get('date_start')).toBe('2026-06-01');
  });

  it.each([
    ['fetchEstimateById', 'estimate', '/books/v3/estimates/EST-1', 'EST-1'],
    ['fetchSalesOrderById', 'salesorder', '/books/v3/salesorders/SO-1', 'SO-1'],
    ['fetchInvoiceById', 'invoice', '/books/v3/invoices/INV-1', 'INV-1'],
  ] as const)('fetches Zoho transaction details via %s', async (methodName, responseKey, expectedPath, externalId) => {
    const seenUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      seenUrls.push(url);

      if (url.pathname.includes('/oauth/v2/token')) {
        return new Response(JSON.stringify({ access_token: 'token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        [responseKey]: { id: externalId, line_items: [{ item_id: 'SKU-1' }] },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const adapter = createZohoAdapter('zoho_books', {
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
      organization_id: 'org-1',
      accounts_base_url: 'https://accounts.zoho.in',
      api_base_url: 'https://www.zohoapis.in/books/v3',
    });

    const detail = await adapter[methodName](externalId);

    expect(detail).toMatchObject({ id: externalId });
    const dataRequest = seenUrls.find((url) => !url.pathname.includes('/oauth/v2/token'));
    expect(dataRequest?.pathname).toBe(expectedPath);
    expect(dataRequest?.searchParams.get('organization_id')).toBe('org-1');
  });
});
