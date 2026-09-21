import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers } = vi.hoisted(() => ({
  handlers: {
    catalog: vi.fn(), brands: vi.fn(), categories: vi.fn(), search: vi.fn(), recommendations: vi.fn(),
    me: vi.fn(), homeReco: vi.fn(), product: vi.fn(), family: vi.fn(), recoCategory: vi.fn(), recoBrand: vi.fn(),
  },
}));

vi.mock('../../../app/api/buyer/catalog/route', () => ({ GET: handlers.catalog }));
vi.mock('../../../app/api/buyer/brands/route', () => ({ GET: handlers.brands }));
vi.mock('../../../app/api/buyer/categories/route', () => ({ GET: handlers.categories }));
vi.mock('../../../app/api/buyer/search/route', () => ({ GET: handlers.search }));
vi.mock('../../../app/api/buyer/recommendations/route', () => ({ GET: handlers.recommendations }));
vi.mock('../../../app/api/buyer/me/route', () => ({ GET: handlers.me }));
vi.mock('../../../app/api/buyer/home/reco/route', () => ({ GET: handlers.homeReco }));
vi.mock('../../../app/api/buyer/products/[id]/route', () => ({ GET: handlers.product }));
vi.mock('../../../app/api/buyer/product-families/[id]/route', () => ({ GET: handlers.family }));
vi.mock('../../../app/api/buyer/reco/category/[id]/route', () => ({ GET: handlers.recoCategory }));
vi.mock('../../../app/api/buyer/reco/brand/[id]/route', () => ({ GET: handlers.recoBrand }));

import { GET } from '../../../app/api/public/g/[...path]/route';

function call(path: string, headers: Record<string, string> = {}) {
  const url = new URL(`https://acme.example.com/api/public/g/${path}`);
  const req = new NextRequest(url, { headers });
  return GET(req, { params: Promise.resolve({ path: url.pathname.replace('/api/public/g/', '').split('/') }) });
}

const CREDENTIALS = {
  cookie: 'sb-access-token=SECRET',
  authorization: 'Bearer SECRET',
  'x-verified-user-id': 'user-1',
  'x-verified-buyer-id': 'buyer-1',
  'x-verified-role': 'buyer_admin',
  'x-buyer-preview': 'preview-token',
  'x-verified-tenant-id': 'tenant-1',
  'x-verified-storefront-live': '1',
};

describe('GET /api/public/g/*', () => {
  beforeEach(() => {
    Object.values(handlers).forEach((h) => h.mockReset());
    handlers.catalog.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Cache-Control': 'private, max-age=0, must-revalidate', 'Set-Cookie': 'a=b' } }));
  });

  it('rebuilds the upstream request from scratch: no credentials or identity headers, tenant + live only', async () => {
    const res = await call('catalog?limit=40', CREDENTIALS);
    expect(res.status).toBe(200);
    const upstreamReq = handlers.catalog.mock.calls[0][0] as NextRequest;
    expect(new URL(upstreamReq.url).pathname).toBe('/api/buyer/catalog');
    expect(new URL(upstreamReq.url).search).toBe('?limit=40');
    for (const forbidden of ['cookie', 'authorization', 'x-verified-user-id', 'x-verified-buyer-id', 'x-verified-role', 'x-buyer-preview']) {
      expect(upstreamReq.headers.get(forbidden)).toBeNull();
    }
    expect(upstreamReq.headers.get('x-verified-tenant-id')).toBe('tenant-1');
    expect(upstreamReq.headers.get('x-verified-storefront-live')).toBe('1');
  });

  it('marks a 200 guest response CDN-cacheable and strips cookies', async () => {
    const res = await call('catalog?limit=40', CREDENTIALS);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=120');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('never caches non-200 responses (not live, unknown tenant, errors)', async () => {
    handlers.catalog.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    const res = await call('catalog', {});
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('never caches requests carrying share_token or campaign_id', async () => {
    const a = await call('catalog?share_token=abc', CREDENTIALS);
    const b = await call('catalog?campaign_id=c1', CREDENTIALS);
    expect(a.headers.get('Cache-Control')).toBe('private, no-store');
    expect(b.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('404s anything without a guest twin, including the tokenized catalog path', async () => {
    for (const path of ['catalog/SOME_SHARE_TOKEN', 'orders', 'invoices', 'home/promotions', '../tenant/catalogs']) {
      const res = await call(path, CREDENTIALS);
      expect(res.status).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    }
    expect(handlers.catalog).not.toHaveBeenCalled();
  });

  it('passes the id param to dynamic upstream handlers', async () => {
    handlers.product.mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await call('products/prod-9', CREDENTIALS);
    expect(res.status).toBe(200);
    const ctx = handlers.product.mock.calls[0][1] as { params: Promise<{ id: string }> };
    expect(await ctx.params).toEqual({ id: 'prod-9' });
  });

  it('rejects unknown query params with 400 BEFORE any upstream (database) work, and never caches the rejection', async () => {
    for (const path of ['catalog?limit=40&x=8f3a', 'catalog?_=123', 'brands?limit=5', 'products/prod-9?v=2']) {
      const res = await call(path, CREDENTIALS);
      expect(res.status, path).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    }
    expect(handlers.catalog).not.toHaveBeenCalled();
    expect(handlers.brands).not.toHaveBeenCalled();
    expect(handlers.product).not.toHaveBeenCalled();
  });

  it('rejects malformed values and ids', async () => {
    for (const path of ['catalog?wh=nope', 'catalog?offset=999999', `catalog?search=${'a'.repeat(101)}`, 'products/bad%20id', 'products/%E0%A4%A']) {
      const res = await call(path, CREDENTIALS);
      expect(res.status, path).toBe(400);
    }
    expect(handlers.product).not.toHaveBeenCalled();
  });

  it('turns ?wh=<uuid> into ONLY the delivery cookie the private handlers read (no other cookie survives)', async () => {
    const wh = '4f1c2b7e-9d3a-4c11-8a55-0b6f3a9e1d20';
    await call(`catalog?limit=40&wh=${wh}`, CREDENTIALS);
    const upstreamReq = handlers.catalog.mock.calls[0][0] as NextRequest;
    const cookie = upstreamReq.headers.get('cookie') ?? '';
    expect(cookie.startsWith('df_buyer_delivery_v1=')).toBe(true);
    expect(cookie).not.toContain('sb-');
    expect(cookie).not.toContain('SECRET');
    expect(decodeURIComponent(cookie.split('=').slice(1).join('='))).toContain(`"nearest_warehouse_id":"${wh}"`);
    expect(new URL(upstreamReq.url).searchParams.has('wh')).toBe(false);
    expect(new URL(upstreamReq.url).searchParams.get('limit')).toBe('40');
  });

  it('sends no cookie at all when no warehouse is given', async () => {
    await call('catalog?limit=40', CREDENTIALS);
    expect((handlers.catalog.mock.calls[0][0] as NextRequest).headers.get('cookie')).toBeNull();
  });
});
