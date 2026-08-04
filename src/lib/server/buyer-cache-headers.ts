// Cache-Control for buyer API responses. All buyer routes are authenticated via
// cookie/JWT and gated by per-buyer brand/catalog visibility — never use `public`
// or `s-maxage` here, a shared/CDN cache keyed only on URL would leak one buyer's
// response to another. `private` scopes caching to the browser making the request.

// Frequently-changing, buyer-specific data: home metrics, orders, estimates,
// invoices, profile, activity.
export const BUYER_CACHE_PERSONAL = {
  'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
} as const;

// Less-volatile, buyer-scoped data without per-item selling prices: categories,
// brands, catalogs list, home promotions.
export const BUYER_CACHE_CATALOG = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;

// Responses whose body carries a per-item selling price: catalog browse/search/
// detail, tokenized share-link catalog, home reco (priced product cards), cart
// bundles. Shortest HTTP TTL — revalidate on every network request so mid-day
// price edits are not browser-cached. Client TanStack tiers may still hold the
// payload longer for navigation UX; pull-to-refresh always refetches.
export const BUYER_CACHE_PRICED = {
  'Cache-Control': 'private, max-age=0, must-revalidate',
} as const;
