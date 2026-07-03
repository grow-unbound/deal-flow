import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getZohoPhasePlan, createZohoAdapter } from '../../../supabase/functions/_shared/integrations-zoho';
import { getZohoOAuthScopes } from '@/lib/integrations/zoho-oauth';

describe('zoho warehouse sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the inventory settings warehouse endpoint for warehouse syncs', async () => {
    const seenUrls: URL[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      seenUrls.push(url);

      if (url.pathname.includes('/oauth/v2/token')) {
        return new Response(JSON.stringify({ access_token: 'token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        warehouses: [],
        page_context: { has_more_page: false },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const adapter = createZohoAdapter('zoho_books', {
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
      organization_id: 'org-1',
      accounts_base_url: 'https://accounts.zoho.in',
      api_base_url: 'https://www.zohoapis.in/books/v3',
    });

    const phase = getZohoPhasePlan('zoho_books', 'reference').find((entry) => entry.id === 'warehouses');
    expect(phase).toBeTruthy();
    if (!phase) return;

    await adapter.fetchPhasePage(phase, null, null);

    const dataRequest = seenUrls.find((url) => !url.pathname.includes('/oauth/v2/token'));
    expect(dataRequest?.toString()).toContain('https://www.zohoapis.in/inventory/v1/settings/warehouses');
    expect(dataRequest?.searchParams.get('organization_id')).toBe('org-1');
  });

  it('keeps the Zoho Books locations phase on the books API', async () => {
    const seenUrls: URL[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      seenUrls.push(url);

      if (url.pathname.includes('/oauth/v2/token')) {
        return new Response(JSON.stringify({ access_token: 'token-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        locations: [],
        page_context: { has_more_page: false },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const adapter = createZohoAdapter('zoho_books', {
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
      organization_id: 'org-1',
      accounts_base_url: 'https://accounts.zoho.in',
      api_base_url: 'https://www.zohoapis.in/books/v3',
    });

    const phase = getZohoPhasePlan('zoho_books', 'reference').find((entry) => entry.id === 'locations');
    expect(phase).toBeTruthy();
    if (!phase) return;

    await adapter.fetchPhasePage(phase, null, null);

    const dataRequest = seenUrls.find((url) => !url.pathname.includes('/oauth/v2/token'));
    expect(dataRequest?.toString()).toContain('https://www.zohoapis.in/books/v3/locations');
  });

  it('publishes the right OAuth scopes per Zoho integration type', () => {
    expect(getZohoOAuthScopes('zoho_books')).toBe('ZohoBooks.fullaccess.all,ZohoInventory.settings.READ');
    expect(getZohoOAuthScopes('zoho_inventory')).toBe('ZohoInventory.fullaccess.all,ZohoInventory.settings.READ');
  });
});
