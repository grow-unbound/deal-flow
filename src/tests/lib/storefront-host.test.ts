import { describe, expect, it } from 'vitest';
import {
  authCookieDomain,
  buildStorefrontHandoffUrl,
  canonicalStorefrontHost,
  canonicalStorefrontUrl,
  isReservedStorefrontLabel,
  parseRequestHost,
  safeReturnToPath,
  sellerAppHostForRequest,
  storefrontOriginForRequest,
  tenantStorefrontHostForRequest,
  toCanonicalHost,
  withAuthCookieDomain,
} from '@/lib/storefront-host';
import {
  isGuestCatalogApiPath,
  isGuestStorefrontPagePath,
  toInternalBuyPath,
  toPublicStorefrontPath,
} from '@/lib/storefront-paths';

describe('auth cookie domain', () => {
  it('is always host-only, in every environment — never a shared .useyukti.in domain', () => {
    const original = process.env.NODE_ENV;
    for (const env of ['production', 'development', 'test'] as const) {
      // @ts-expect-error - NODE_ENV is readonly in the type, writable at runtime for this test
      process.env.NODE_ENV = env;
      expect(authCookieDomain()).toBeUndefined();
      expect(withAuthCookieDomain({ path: '/' })).toEqual({ path: '/' });
    }
    // @ts-expect-error - restore
    process.env.NODE_ENV = original;
  });
});

describe('safeReturnToPath', () => {
  it('accepts a return_to that resolves to the destination host', () => {
    expect(safeReturnToPath('https://wineyard.useyukti.in/product/123?x=1', 'wineyard.useyukti.in'))
      .toBe('/product/123?x=1');
  });

  it('rejects a return_to pointing at a different host (open-redirect guard)', () => {
    expect(safeReturnToPath('https://evil.example.com/phish', 'wineyard.useyukti.in')).toBeNull();
  });

  it('rejects a return_to pointing at a different tenant subdomain', () => {
    expect(safeReturnToPath('https://acme.useyukti.in/product/123', 'wineyard.useyukti.in')).toBeNull();
  });

  it('rejects malformed input and null/undefined', () => {
    expect(safeReturnToPath('not-a-url', 'wineyard.useyukti.in')).toBeNull();
    expect(safeReturnToPath(null, 'wineyard.useyukti.in')).toBeNull();
    expect(safeReturnToPath(undefined, 'wineyard.useyukti.in')).toBeNull();
  });

  it('rejects a non-http(s) protocol', () => {
    expect(safeReturnToPath('javascript:alert(1)', 'wineyard.useyukti.in')).toBeNull();
  });
});

describe('buildStorefrontHandoffUrl', () => {
  it('builds a handoff URL with token_hash and no next when return_to is absent', () => {
    const url = buildStorefrontHandoffUrl('wineyard.useyukti.in', 'abc123');
    expect(url).toBe('https://wineyard.useyukti.in/auth/storefront-handoff?token_hash=abc123');
  });

  it('appends a validated next path when return_to matches the destination host', () => {
    const url = buildStorefrontHandoffUrl(
      'wineyard.useyukti.in',
      'abc123',
      'https://wineyard.useyukti.in/product/123',
    );
    expect(url).toBe('https://wineyard.useyukti.in/auth/storefront-handoff?token_hash=abc123&next=%2Fproduct%2F123');
  });

  it('drops an invalid/mismatched return_to rather than passing it through', () => {
    const url = buildStorefrontHandoffUrl('wineyard.useyukti.in', 'abc123', 'https://evil.example.com/phish');
    expect(url).toBe('https://wineyard.useyukti.in/auth/storefront-handoff?token_hash=abc123');
  });

  it('uses http for a *.localhost destination', () => {
    const url = buildStorefrontHandoffUrl('wineyard.localhost:3000', 'abc123');
    expect(url).toBe('http://wineyard.localhost:3000/auth/storefront-handoff?token_hash=abc123');
  });
});

describe('local-dev port preservation', () => {
  it('tenantStorefrontHostForRequest carries the port through on *.localhost', () => {
    expect(tenantStorefrontHostForRequest('wine-yard-technologies.localhost:3000', 'acme'))
      .toBe('acme.localhost:3000');
  });

  it('tenantStorefrontHostForRequest has no port on the canonical (non-local) host', () => {
    expect(tenantStorefrontHostForRequest('wineyard.useyukti.in', 'acme')).toBe('acme.useyukti.in');
  });

  it('sellerAppHostForRequest carries the port through on *.localhost', () => {
    expect(sellerAppHostForRequest('wineyard.localhost:3000')).toBe('app.localhost:3000');
  });

  it('buildStorefrontHandoffUrl with a port-carrying local destination host is well-formed', () => {
    const destinationHost = tenantStorefrontHostForRequest('wine-yard-technologies.localhost:3000', 'acme');
    const url = buildStorefrontHandoffUrl(destinationHost, 'tok-1');
    expect(url).toBe('http://acme.localhost:3000/auth/storefront-handoff?token_hash=tok-1');
  });
});

describe('storefront host', () => {
  it('parses tenant, app, and reserved labels', () => {
    expect(parseRequestHost('wineyard.useyukti.in')).toEqual({
      kind: 'tenant',
      slug: 'wineyard',
      suffix: 'useyukti.in',
    });
    expect(parseRequestHost('app.useyukti.in')).toEqual({ kind: 'app', suffix: 'useyukti.in' });
    expect(parseRequestHost('catalog.useyukti.in')).toEqual({
      kind: 'reserved',
      label: 'catalog',
      suffix: 'useyukti.in',
    });
    expect(parseRequestHost('localhost:3000')).toEqual({ kind: 'local' });
    expect(parseRequestHost('wineyard.localhost:3000')).toEqual({
      kind: 'tenant',
      slug: 'wineyard',
      suffix: 'localhost',
    });
    expect(parseRequestHost('app.localhost:3000')).toEqual({ kind: 'app', suffix: 'localhost' });
  });

  it('301s non-canonical suffixes to useyukti.in', () => {
    expect(toCanonicalHost(parseRequestHost('wineyard.yukti.so'))).toBe('wineyard.useyukti.in');
    expect(toCanonicalHost(parseRequestHost('app.yukti.so'))).toBe('app.useyukti.in');
    expect(toCanonicalHost(parseRequestHost('wineyard.useyukti.in'))).toBeNull();
    expect(toCanonicalHost(parseRequestHost('wineyard.localhost'))).toBeNull();
    expect(toCanonicalHost(parseRequestHost('app.localhost'))).toBeNull();
  });

  it('computes the canonical storefront URL from slug', () => {
    expect(canonicalStorefrontHost('wineyard')).toBe('wineyard.useyukti.in');
    expect(canonicalStorefrontUrl('wineyard')).toBe('https://wineyard.useyukti.in');
    expect(canonicalStorefrontUrl('wineyard', '/product/1')).toBe('https://wineyard.useyukti.in/product/1');
    expect(storefrontOriginForRequest('app.localhost:3000', 'wineyard')).toBe('http://wineyard.localhost:3000');
    expect(storefrontOriginForRequest('app.useyukti.in', 'wineyard')).toBe('https://wineyard.useyukti.in');
  });

  it('reserves system labels', () => {
    expect(isReservedStorefrontLabel('app')).toBe(true);
    expect(isReservedStorefrontLabel('wineyard')).toBe(false);
  });
});

describe('storefront paths', () => {
  it('rewrites public paths to the existing /buy tree', () => {
    expect(toInternalBuyPath('/')).toBe('/buy/home');
    expect(toInternalBuyPath('/product/abc')).toBe('/buy/product/abc');
    expect(toInternalBuyPath('/category/c1')).toBe('/buy/home/category/c1');
    expect(toInternalBuyPath('/brand/b1')).toBe('/buy/home/brand/b1');
    expect(toInternalBuyPath('/cart')).toBe('/buy/cart');
  });

  it('301s /buy URLs to unprefixed storefront paths', () => {
    expect(toPublicStorefrontPath('/buy/home')).toBe('/');
    expect(toPublicStorefrontPath('/buy/product/abc')).toBe('/product/abc');
    expect(toPublicStorefrontPath('/buy/home/category/c1')).toBe('/category/c1');
    expect(toPublicStorefrontPath('/buy/cart')).toBe('/cart');
  });

  it('allows guests on browse pages, not cart or orders', () => {
    expect(isGuestStorefrontPagePath('/')).toBe(true);
    expect(isGuestStorefrontPagePath('/product/x')).toBe(true);
    expect(isGuestStorefrontPagePath('/cart')).toBe(false);
    expect(isGuestStorefrontPagePath('/orders')).toBe(false);
    expect(isGuestCatalogApiPath('/api/buyer/catalog')).toBe(true);
    expect(isGuestCatalogApiPath('/api/buyer/orders')).toBe(false);
  });

  it('allows guests on the delivery-location picker — BuyerSelectionGate redirects every visitor without a stored location there, guests included, before it even loads the home page', () => {
    expect(isGuestStorefrontPagePath('/location')).toBe(true);
    expect(isGuestStorefrontPagePath('/buy/location')).toBe(true);
    expect(isGuestCatalogApiPath('/api/buyer/nearest-location')).toBe(true);
  });
});
