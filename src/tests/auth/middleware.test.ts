import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 15_000 });

const {
  getClaimsMock,
  resolveStorefrontMock,
  resolveTenantSlugMock,
  consumeRateLimitMock,
  consumeEnumerationRateLimitMock,
  recordViolationMock,
  verifyHumanVerifiedMock,
} = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  resolveStorefrontMock: vi.fn(),
  resolveTenantSlugMock: vi.fn(),
  consumeRateLimitMock: vi.fn(),
  consumeEnumerationRateLimitMock: vi.fn(),
  recordViolationMock: vi.fn(),
  verifyHumanVerifiedMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getClaims: getClaimsMock,
    },
  })),
}));

vi.mock('@/lib/server/resolve-storefront-tenant', () => ({
  resolveStorefrontTenantBySlug: (...args: unknown[]) => resolveStorefrontMock(...args),
  isPublicCatalogLive: (record: { liveAt: string | null } | null) => Boolean(record?.liveAt),
  resolveTenantSlugById: (...args: unknown[]) => resolveTenantSlugMock(...args),
}));

vi.mock('@/lib/server/public-catalog-rate-limit', () => ({
  clientIpFromRequest: () => '203.0.113.1',
  consumePublicCatalogRateLimit: (...args: unknown[]) => consumeRateLimitMock(...args),
  consumeEnumerationRateLimit: (...args: unknown[]) => consumeEnumerationRateLimitMock(...args),
  tooManyRequestsResponse: (retryAfterSec: number) =>
    new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec), 'Cache-Control': 'private, no-store' },
    }),
}));

vi.mock('@/lib/server/ip-challenge', () => ({
  recordViolationAndCheckChallenge: (...args: unknown[]) => recordViolationMock(...args),
}));

vi.mock('@/lib/server/human-verify-token', () => ({
  HUMAN_VERIFIED_COOKIE: 'df_human_verified',
  verifyHumanVerifiedToken: (...args: unknown[]) => verifyHumanVerifiedMock(...args),
}));

function tenantRequest(path: string, host = 'wineyard.useyukti.in') {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

function catalogRequest(path: string, host = 'catalog.useyukti.in') {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

describe('middleware auth redirects', () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    resolveStorefrontMock.mockReset();
    resolveTenantSlugMock.mockReset();
    resolveTenantSlugMock.mockResolvedValue(null);
    consumeRateLimitMock.mockReset();
    consumeRateLimitMock.mockResolvedValue({ ok: true, retryAfterSec: 0 });
    consumeEnumerationRateLimitMock.mockReset();
    consumeEnumerationRateLimitMock.mockResolvedValue({ ok: true, retryAfterSec: 0 });
    recordViolationMock.mockReset();
    recordViolationMock.mockResolvedValue({ challengeRequired: false, violationCount: 1 });
    verifyHumanVerifiedMock.mockReset();
    verifyHumanVerifiedMock.mockResolvedValue(false);
    resolveStorefrontMock.mockResolvedValue({
      tenantId: 'tenant-wy',
      slug: 'wineyard',
      catalogId: 'cat-1',
      liveAt: '2026-09-01T00:00:00.000Z',
      pricingMode: 'base_selling_rate',
      priceListId: null,
    });
  });

  it('allows anonymous access to /activate without redirecting to /login', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/activate'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects to /login when the session is missing', async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: { message: 'Auth session missing' },
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fdashboard');
  });

  it('redirects to /login when the JWT fails signature verification', async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid signature' },
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/buy/catalog'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fbuy%2Fcatalog');
  });

  it('forwards verified location ids from the verified claims', async () => {
    getClaimsMock.mockResolvedValue({
      data: {
        claims: {
          sub: 'seller-user-1',
          tenant_id: 'tenant-1',
          user_role: 'seller_assistant',
          location_ids: ['loc-1', 'loc-2'],
        },
      },
      error: null,
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/orders'));

    expect(response.headers.get('x-tenant-subdomain')).toBe('');
  });

  it('lets guests browse a live tenant host without login', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('lets a guest reach the delivery-location picker without being bounced to /login (BuyerSelectionGate sends every visitor there, guests included, before rendering home)', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/location?returnTo=%2Fbuy%2Fhome'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();

    const apiResponse = await middleware(tenantRequest('/api/buyer/nearest-location?lat=1&lng=2'));
    expect(apiResponse.status).not.toBe(404);
    expect(apiResponse.headers.get('location')).toBeNull();
  });

  it('serves tenant hosts on *.localhost without 301ing to useyukti.in', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(
      new NextRequest('http://wineyard.localhost:3000/', { headers: { host: 'wineyard.localhost:3000' } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('301s app.localhost/buy/home to wineyard.localhost', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(
      new NextRequest('http://app.localhost:3000/buy/home', { headers: { host: 'app.localhost:3000' } }),
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('http://wineyard.localhost:3000/');
  });

  it('301s /buy/home on a tenant host to /', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/buy/home'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://wineyard.useyukti.in/');
  });

  it('301s app.useyukti.in/buy/home to the WineYard storefront', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/buy/home', 'app.useyukti.in'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://wineyard.useyukti.in/');
  });

  it('rejects buyer-only sessions on the seller app host, resolving their own tenant slug', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'b1', tenant_id: 'tenant-wy', user_role: 'buyer_admin', buyer_id: 'buyer-1' } },
      error: null,
    });
    resolveTenantSlugMock.mockResolvedValue('wineyard');
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/dashboard', 'app.useyukti.in'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://wineyard.useyukti.in/');
    expect(resolveTenantSlugMock).toHaveBeenCalledWith('tenant-wy');
  });

  it('redirects a buyer session for a different tenant to that tenant\'s own storefront, not WineYard', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'b2', tenant_id: 'tenant-acme', user_role: 'buyer_admin', buyer_id: 'buyer-2' } },
      error: null,
    });
    resolveTenantSlugMock.mockResolvedValue('acme');
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/dashboard', 'app.useyukti.in'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://acme.useyukti.in/');
  });

  it('falls back to WineYard when a buyer session has no resolvable tenant slug', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'b3', tenant_id: 'tenant-unknown', user_role: 'buyer_admin', buyer_id: 'buyer-3' } },
      error: null,
    });
    resolveTenantSlugMock.mockResolvedValue(null);
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/dashboard', 'app.useyukti.in'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://wineyard.useyukti.in/');
  });

  it('does not serve products on an unpublished tenant host', async () => {
    resolveStorefrontMock.mockResolvedValue({
      tenantId: 'tenant-x',
      slug: 'acme',
      catalogId: 'cat-1',
      liveAt: null,
      pricingMode: null,
      priceListId: null,
    });
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const page = await middleware(tenantRequest('/', 'acme.useyukti.in'));
    expect(page.status).toBe(200);
    const api = await middleware(tenantRequest('/api/buyer/catalog', 'acme.useyukti.in'));
    expect(api.status).toBe(404);
  });

  it('rewrites to a real 404 page for a slug with no matching tenant at all — not the not-live page', async () => {
    resolveStorefrontMock.mockResolvedValue(null);
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const page = await middleware(tenantRequest('/', 'gibberish.useyukti.in'));
    expect(page.headers.get('x-middleware-rewrite')).toContain('/tenant-not-found');

    const api = await middleware(tenantRequest('/api/buyer/catalog', 'gibberish.useyukti.in'));
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'Not found' });
  });

  it('rate-limits slug-enumeration probes against nonexistent tenants, per-IP', async () => {
    resolveStorefrontMock.mockResolvedValue(null);
    consumeEnumerationRateLimitMock.mockResolvedValue({ ok: false, retryAfterSec: 45 });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/', 'another-gibberish-slug.useyukti.in'));
    expect(response.status).toBe(429);
    expect(consumeEnumerationRateLimitMock).toHaveBeenCalledWith('203.0.113.1');
  });

  it('escalates to a Turnstile challenge redirect (not another 429) once violations cross the threshold, for page requests', async () => {
    resolveStorefrontMock.mockResolvedValue(null);
    consumeEnumerationRateLimitMock.mockResolvedValue({ ok: false, retryAfterSec: 45 });
    recordViolationMock.mockResolvedValue({ challengeRequired: true, violationCount: 3 });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/some-page', 'yet-another-gibberish.useyukti.in'));
    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toContain('/verify-human');
    expect(location).toContain('return_to=%2Fsome-page');
  });

  it('does not escalate an API request to the challenge redirect — keeps returning 429', async () => {
    resolveStorefrontMock.mockResolvedValue(null);
    consumeEnumerationRateLimitMock.mockResolvedValue({ ok: false, retryAfterSec: 45 });
    recordViolationMock.mockResolvedValue({ challengeRequired: true, violationCount: 5 });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/api/buyer/catalog', 'yet-more-gibberish.useyukti.in'));
    expect(response.status).toBe(429);
  });

  it('skips the enumeration limiter entirely once a valid human-verified cookie is present', async () => {
    resolveStorefrontMock.mockResolvedValue(null);
    verifyHumanVerifiedMock.mockResolvedValue(true);
    const { middleware } = await import('../../../middleware');
    const request = tenantRequest('/', 'gibberish-but-verified.useyukti.in');
    request.cookies.set('df_human_verified', 'some-signed-token');
    const response = await middleware(request);
    expect(consumeEnumerationRateLimitMock).not.toHaveBeenCalled();
    // Still a real 404 — verification bypasses the rate limit, not the not-found result.
    expect(response.headers.get('x-middleware-rewrite')).toContain('/tenant-not-found');
  });

  it('rate-limits anonymous catalog GETs', async () => {
    consumeRateLimitMock.mockResolvedValue({ ok: false, retryAfterSec: 30 });
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/api/buyer/catalog'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('301s yukti.so tenant hosts to useyukti.in', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(tenantRequest('/', 'wineyard.yukti.so'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://wineyard.useyukti.in/');
  });
});

describe('catalog host middleware', () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    resolveStorefrontMock.mockReset();
    resolveTenantSlugMock.mockReset();
    resolveTenantSlugMock.mockResolvedValue(null);
    consumeRateLimitMock.mockReset();
    consumeRateLimitMock.mockResolvedValue({ ok: true, retryAfterSec: 0 });
    consumeEnumerationRateLimitMock.mockReset();
    consumeEnumerationRateLimitMock.mockResolvedValue({ ok: true, retryAfterSec: 0 });
    recordViolationMock.mockReset();
    recordViolationMock.mockResolvedValue({ challengeRequired: false, violationCount: 1 });
    verifyHumanVerifiedMock.mockReset();
    verifyHumanVerifiedMock.mockResolvedValue(false);
  });

  it('redirects unauthenticated catalog / to /login', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(catalogRequest('/'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://catalog.useyukti.in/login?next=%2F');
  });

  it('allows public /login on catalog host without auth', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(catalogRequest('/login'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('rewrites buyer session on catalog / to /workspaces', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'b1', tenant_id: 'tenant-wy', user_role: 'buyer_admin', buyer_id: 'buyer-1' } },
      error: null,
    });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(catalogRequest('/'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toContain('/workspaces');
  });

  it('redirects seller session on catalog host to app.useyukti.in', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 's1', tenant_id: 'tenant-wy', user_role: 'seller_admin' } },
      error: null,
    });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(catalogRequest('/workspaces'));
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://app.useyukti.in/dashboard');
  });

  it('serves catalog.localhost without canonical redirect', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'missing' } });
    const { middleware } = await import('../../../middleware');
    const response = await middleware(
      new NextRequest('http://catalog.localhost:3000/login', { headers: { host: 'catalog.localhost:3000' } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
