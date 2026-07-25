// Cache-Control for buyer API responses. All buyer routes are authenticated via
// cookie/JWT and gated by per-buyer brand/catalog visibility — never use `public`
// or `s-maxage` here, a shared/CDN cache keyed only on URL would leak one buyer's
// response to another. `private` scopes caching to the browser making the request.

// Frequently-changing, buyer-specific data: home feed, orders, estimates, invoices, profile, activity.
export const BUYER_CACHE_PERSONAL = {
  'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
} as const;

// Less-volatile, buyer-scoped listing data: categories, brands, catalogs list.
// Never use for a response that carries a per-item selling price — see BUYER_CACHE_PRICED.
export const BUYER_CACHE_CATALOG = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;

// Any response carrying a per-item selling price: catalog browse/search/detail,
// tokenized share-link catalog, recommendations, cart bundles. Distributors edit
// prices directly and buyers must see the change immediately, so this forces
// revalidation on every request instead of serving a stale cached price.
export const BUYER_CACHE_PRICED = {
  'Cache-Control': 'private, max-age=0, must-revalidate',
} as const;
