// Default tier — also the QueryClientProvider global default. Use for seller-side
// transactional/dynamic data (estimates, orders, invoices, dashboard, customers):
// changes often enough that a long cache would show stale numbers, but still benefits
// from surviving a quick back/forward nav.
export const NAVIGATION_QUERY_STALE_TIME = 5 * 60 * 1000;
export const NAVIGATION_QUERY_GC_TIME = 30 * 60 * 1000;

// Reference/config tier — seller-side static-ish data (brands, catalogs, cohorts,
// price lists, warehouses, locations, categories, buyer-app settings): edited rarely,
// safe to cache long. Use explicitly instead of relying on the transactional default.
export const REFERENCE_QUERY_STALE_TIME = 20 * 60 * 1000;
export const REFERENCE_QUERY_GC_TIME = 60 * 60 * 1000;

// Buyer PWA default tier — buyer-side dynamic data (orders, invoices, estimates,
// activity): kept short since buyers expect near-real-time status on their own docs.
export const BUYER_QUERY_STALE_TIME = 30_000;
export const BUYER_QUERY_GC_TIME = 2 * 60_000;

// Buyer PWA reference tier — catalog browse data (categories, brands, catalogs list,
// buyer profile/business policy): changes rarely within a session, safe to cache long.
export const BUYER_REFERENCE_QUERY_STALE_TIME = 15 * 60 * 1000;
export const BUYER_REFERENCE_QUERY_GC_TIME = 60 * 60 * 1000;

// Buyer PWA price tier — any response carrying a per-item selling price (catalog
// grid/search/product-detail, recommendations, cart bundles, resolved cart items):
// distributors edit prices directly and buyers must see the change immediately, so
// this stays far shorter than BUYER_QUERY_STALE_TIME. Pair with BUYER_CACHE_PRICED
// on the API route (buyer-cache-headers.ts) so the HTTP layer doesn't add its own lag.
export const BUYER_PRICE_QUERY_STALE_TIME = 15_000;
export const BUYER_PRICE_QUERY_GC_TIME = 60_000;
