// Cache-Control for buyer API responses. All buyer routes are authenticated via
// cookie/JWT and gated by per-buyer brand/catalog visibility — never use `public`
// or `s-maxage` here, a shared/CDN cache keyed only on URL would leak one buyer's
// response to another. `private` scopes caching to the browser making the request.

// Frequently-changing, buyer-specific data: home feed, orders, estimates, invoices, profile, activity.
export const BUYER_CACHE_PERSONAL = {
  'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
} as const;

// Less-volatile, buyer-scoped listing data: catalog, categories, brands, catalogs.
export const BUYER_CACHE_CATALOG = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;
