import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createZohoAdapter, getZohoPhasePlan } from '../../../supabase/functions/_shared/integrations-zoho';

describe('zoho transactional sync windowing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps estimates, orders, and invoices in the transactional phase plan', () => {
    const phaseIds = getZohoPhasePlan('zoho_books', 'transactional').map((phase) => phase.id);

    expect(phaseIds).toEqual(['estimates', 'orders', 'invoices']);
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
});
