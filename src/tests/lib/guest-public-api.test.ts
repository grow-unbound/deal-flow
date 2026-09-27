import { describe, expect, it } from 'vitest';
import { appendWarehouseParam, hasNonPublicParams, toBuyerUpstreamPath, toGuestPublicUrl, validateGuestPublicQuery } from '@/lib/guest-public-api';
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

const WH = '4f1c2b7e-9d3a-4c11-8a55-0b6f3a9e1d20';
const q = (s: string) => new URLSearchParams(s);

describe('validateGuestPublicQuery (cache-buster / abuse guard)', () => {
  it('accepts exactly what the storefront sends', () => {
    expect(validateGuestPublicQuery('catalog', q('limit=40&offset=80&search=camera&category_id=abc-123&brand_id=b1'))).toBeNull();
    expect(validateGuestPublicQuery('catalog', q(`limit=40&wh=${WH}`))).toBeNull();
    expect(validateGuestPublicQuery('search', q('q=cctv&scope=catalog'))).toBeNull();
    expect(validateGuestPublicQuery('recommendations', q('product_id=p-1'))).toBeNull();
    expect(validateGuestPublicQuery('brands', q(''))).toBeNull();
    expect(validateGuestPublicQuery('products/abc', q(`wh=${WH}`))).toBeNull();
  });

  it('rejects unknown params, so a random query string cannot force a database render per request', () => {
    expect(validateGuestPublicQuery('catalog', q('limit=40&x=8f3a'))).toBe('unsupported_param:x');
    expect(validateGuestPublicQuery('catalog', q('_=1789000000'))).toBe('unsupported_param:_');
    expect(validateGuestPublicQuery('brands', q('limit=5'))).toBe('unsupported_param:limit');
    expect(validateGuestPublicQuery('products/abc', q('v=2'))).toBe('unsupported_param:v');
  });

  it('rejects malformed or oversized values', () => {
    expect(validateGuestPublicQuery('catalog', q('wh=not-a-uuid'))).toBe('invalid_param:wh');
    expect(validateGuestPublicQuery('catalog', q('limit=abc'))).toBe('invalid_param:limit');
    expect(validateGuestPublicQuery('catalog', q('offset=99999'))).toBe('invalid_param:offset');
    expect(validateGuestPublicQuery('catalog', q(`search=${'a'.repeat(101)}`))).toBe('invalid_param:search');
    expect(validateGuestPublicQuery('search', q(`q=${'a'.repeat(101)}`))).toBe('invalid_param:q');
    expect(validateGuestPublicQuery('search', q('scope=orders'))).toBe('invalid_param:scope');
    expect(validateGuestPublicQuery('catalog', q('category_id=' + encodeURIComponent('a b;drop')))).toBe('invalid_param:category_id');
  });
});

describe('appendWarehouseParam', () => {
  it('adds a valid warehouse to guest twin URLs only', () => {
    expect(appendWarehouseParam('/api/public/g/catalog?limit=40', WH)).toBe(`/api/public/g/catalog?limit=40&wh=${WH}`);
    expect(appendWarehouseParam('/api/public/g/brands', WH)).toBe(`/api/public/g/brands?wh=${WH}`);
    expect(appendWarehouseParam('/api/public/g/brands', null)).toBe('/api/public/g/brands');
    expect(appendWarehouseParam('/api/public/g/brands', 'nope')).toBe('/api/public/g/brands');
    expect(appendWarehouseParam('/api/buyer/catalog', WH)).toBe('/api/buyer/catalog');
  });
});
