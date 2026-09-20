import { describe, expect, it } from 'vitest';
import { hasNonPublicParams, toBuyerUpstreamPath, toGuestPublicUrl } from '@/lib/guest-public-api';
import { isGuestCatalogApiPath, isGuestSearchApiPath, isGuestRateLimitedPath } from '@/lib/storefront-paths';

describe('toGuestPublicUrl', () => {
  it('maps anonymous-safe catalog reads to the guest-only twin, keeping the query', () => {
    expect(toGuestPublicUrl('/api/buyer/catalog?limit=40&offset=0')).toBe('/api/public/g/catalog?limit=40&offset=0');
    expect(toGuestPublicUrl('/api/buyer/brands')).toBe('/api/public/g/brands');
    expect(toGuestPublicUrl('/api/buyer/categories')).toBe('/api/public/g/categories');
    expect(toGuestPublicUrl('/api/buyer/search?q=cam')).toBe('/api/public/g/search?q=cam');
    expect(toGuestPublicUrl('/api/buyer/products/abc-123')).toBe('/api/public/g/products/abc-123');
    expect(toGuestPublicUrl('/api/buyer/product-families/f1')).toBe('/api/public/g/product-families/f1');
    expect(toGuestPublicUrl('/api/buyer/reco/brand/b1')).toBe('/api/public/g/reco/brand/b1');
    expect(toGuestPublicUrl('/api/buyer/me')).toBe('/api/public/g/me');
  });

  it('never maps tokenized / campaign / per-buyer routes', () => {
    expect(toGuestPublicUrl('/api/buyer/catalog/SOME_SHARE_TOKEN')).toBeNull();
    expect(toGuestPublicUrl('/api/buyer/catalog?share_token=abc')).toBeNull();
    expect(toGuestPublicUrl('/api/buyer/catalog?limit=40&campaign_id=c1')).toBeNull();
    expect(toGuestPublicUrl('/api/buyer/orders')).toBeNull();
    expect(toGuestPublicUrl('/api/buyer/invoices')).toBeNull();
    expect(toGuestPublicUrl('/api/buyer/home/promotions')).toBeNull();
    expect(toGuestPublicUrl('/api/buyer/nearest-location?lat=1&lng=2')).toBeNull();
    expect(toGuestPublicUrl('/api/tenant/catalogs')).toBeNull();
    expect(toGuestPublicUrl('https://evil.example/api/buyer/catalog')).toBeNull();
  });

  it('round-trips the upstream path and rejects everything else', () => {
    expect(toBuyerUpstreamPath('catalog')).toBe('/api/buyer/catalog');
    expect(toBuyerUpstreamPath('products/p1')).toBe('/api/buyer/products/p1');
    expect(toBuyerUpstreamPath('catalog/token')).toBeNull();
    expect(toBuyerUpstreamPath('orders')).toBeNull();
    expect(toBuyerUpstreamPath('../tenant/catalogs')).toBeNull();
  });

  it('flags non-public query params', () => {
    expect(hasNonPublicParams('?share_token=x')).toBe(true);
    expect(hasNonPublicParams('campaign_id=x')).toBe(true);
    expect(hasNonPublicParams('?limit=40')).toBe(false);
    expect(hasNonPublicParams('')).toBe(false);
  });
});

describe('storefront path helpers know the guest twin', () => {
  it('treats /api/public/g/* as a guest catalog API with the same limiter classes', () => {
    expect(isGuestCatalogApiPath('/api/public/g/catalog')).toBe(true);
    expect(isGuestRateLimitedPath('/api/public/g/brands')).toBe(true);
    expect(isGuestSearchApiPath('/api/public/g/search')).toBe(true);
    expect(isGuestSearchApiPath('/api/public/g/catalog', '?search=x')).toBe(true);
    expect(isGuestSearchApiPath('/api/public/g/catalog', '?limit=1')).toBe(false);
  });
});
