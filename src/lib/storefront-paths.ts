/** Public (browser) storefront paths — no `/buy` prefix. */

export const STOREFRONT = {
  home: '/',
  login: '/login',
  cart: '/cart',
  search: '/search',
  location: '/location',
  orders: '/orders',
  profile: '/profile',
  account: '/account',
  promotions: '/promotions',
  orderPlaced: '/order-placed',
  estimatePlaced: '/estimate-placed',
  notLive: '/not-live',
  product: (id: string) => `/product/${id}`,
  category: (id: string) => `/category/${id}`,
  brand: (id: string) => `/brand/${id}`,
  list: (id: string) => `/list/${id}`,
  order: (id: string) => `/orders/${id}`,
  invoice: (id: string) => `/invoices/${id}`,
  estimate: (id: string) => `/estimates/${id}`,
} as const;

const PUBLIC_TO_INTERNAL: Array<[string, string]> = [
  ['/product/', '/buy/product/'],
  ['/category/', '/buy/home/category/'],
  ['/brand/', '/buy/home/brand/'],
  ['/list/', '/buy/home/list/'],
  ['/orders/', '/buy/orders/'],
  ['/invoices/', '/buy/invoices/'],
  ['/estimates/', '/buy/estimates/'],
];

const PUBLIC_EXACT_TO_INTERNAL: Record<string, string> = {
  '/': '/buy/home',
  '/cart': '/buy/cart',
  '/search': '/buy/search',
  '/location': '/buy/location',
  '/orders': '/buy/orders',
  '/profile': '/buy/profile',
  '/account': '/buy/account',
  '/promotions': '/buy/promotions',
  '/order-placed': '/buy/order-placed',
  '/estimate-placed': '/buy/estimate-placed',
};

const INTERNAL_EXACT_TO_PUBLIC: Record<string, string> = Object.fromEntries(
  Object.entries(PUBLIC_EXACT_TO_INTERNAL).map(([pub, intern]) => [intern, pub]),
);

/**
 * Browser URL → existing `app/(buyer)/buy/*` pathname for rewrite / classifiers.
 */
export function toInternalBuyPath(pathname: string): string | null {
  if (pathname.startsWith('/buy/') || pathname === '/buy') return pathname;
  if (PUBLIC_EXACT_TO_INTERNAL[pathname]) return PUBLIC_EXACT_TO_INTERNAL[pathname];
  for (const [pub, intern] of PUBLIC_TO_INTERNAL) {
    if (pathname.startsWith(pub)) return intern + pathname.slice(pub.length);
  }
  return null;
}

/**
 * Internal `/buy/*` pathname → public storefront URL (301 target). Also
 * unwraps the guest-ISR internal tree (`/buy/g/<tenantSlug>/...`) back to the
 * same public URL a guest actually typed — this is what makes a direct hit
 * on the ISR-only internal path safe: middleware's existing `/buy/*` guard
 * (any request starting with `/buy/` gets 301'd here) already catches
 * `/buy/g/*` too, since it's a `/buy/` prefix like every other internal path;
 * without this branch it would fail through to the `/` fallback below instead
 * of round-tripping back through the real Host-based tenant resolution.
 */
export function toPublicStorefrontPath(pathname: string): string | null {
  if (pathname.startsWith('/buy/g/')) {
    const rest = pathname.slice('/buy/g/'.length); // "<tenantSlug>/home/category/x"
    const slashIndex = rest.indexOf('/');
    if (slashIndex === -1) return '/';
    return toPublicStorefrontPath(`/buy${rest.slice(slashIndex)}`);
  }
  if (INTERNAL_EXACT_TO_PUBLIC[pathname]) return INTERNAL_EXACT_TO_PUBLIC[pathname];
  if (pathname === '/buy/home') return '/';
  if (pathname.startsWith('/buy/home/category/')) return `/category/${pathname.slice('/buy/home/category/'.length)}`;
  if (pathname.startsWith('/buy/home/brand/')) return `/brand/${pathname.slice('/buy/home/brand/'.length)}`;
  if (pathname.startsWith('/buy/home/list/')) return `/list/${pathname.slice('/buy/home/list/'.length)}`;
  if (pathname.startsWith('/buy/product/')) return `/product/${pathname.slice('/buy/product/'.length)}`;
  if (pathname.startsWith('/buy/orders/')) return `/orders/${pathname.slice('/buy/orders/'.length)}`;
  if (pathname.startsWith('/buy/invoices/')) return `/invoices/${pathname.slice('/buy/invoices/'.length)}`;
  if (pathname.startsWith('/buy/estimates/')) return `/estimates/${pathname.slice('/buy/estimates/'.length)}`;
  if (pathname.startsWith('/buy/search')) return `/search${pathname.slice('/buy/search'.length)}`;
  if (pathname.startsWith('/buy/location')) return `/location${pathname.slice('/buy/location'.length)}`;
  if (pathname.startsWith('/buy/cart')) return `/cart${pathname.slice('/buy/cart'.length)}`;
  if (pathname.startsWith('/buy/profile')) return `/profile${pathname.slice('/buy/profile'.length)}`;
  if (pathname.startsWith('/buy/account')) return `/account${pathname.slice('/buy/account'.length)}`;
  if (pathname.startsWith('/buy/promotions')) return `/promotions${pathname.slice('/buy/promotions'.length)}`;
  if (pathname.startsWith('/buy/order-placed')) return `/order-placed${pathname.slice('/buy/order-placed'.length)}`;
  if (pathname.startsWith('/buy/estimate-placed')) return `/estimate-placed${pathname.slice('/buy/estimate-placed'.length)}`;
  if (pathname.startsWith('/buy/preview/')) return pathname;
  return null;
}

// /location is guest-safe deliberately: BuyerSelectionGate redirects EVERY
// visitor without a stored delivery location there before rendering home,
// including a guest who's never picked one — it's a browsing preference
// (which outlet's stock/pricing to show), not an account feature, and the
// page + its one API dependency (/api/buyer/nearest-location) already
// return a guest-mode profile via requireBuyerAccessProfile. Omitting it
// here silently turns "no location picked yet" into "must log in" for a
// guest, on any multi-location tenant.
// Cart is guest-safe too: add-to-cart itself prompts login (BuyerCartContext
// never actually holds items for a guest), so a guest opening /cart just sees
// the empty-cart "browse catalog" state, not a location/login wall.
const GUEST_PUBLIC_EXACT = new Set(['/', '/search', '/login', '/not-live', '/location', '/cart']);
const GUEST_PUBLIC_PREFIXES = ['/product/', '/category/', '/brand/', '/list/', '/buy/product/', '/buy/home/category/', '/buy/home/brand/', '/buy/home/list/', '/buy/search', '/buy/location'];

/** Browse pages a guest may hit. Cart/orders/profile stay auth-gated. */
export function isGuestStorefrontPagePath(pathname: string): boolean {
  if (GUEST_PUBLIC_EXACT.has(pathname)) return true;
  return GUEST_PUBLIC_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

// Subset of guest-eligible pages that have an ISR twin under
// app/(buyer-guest)/buy/g/[tenantSlug]/... — home, category, brand, list,
// product. Deliberately excludes /search (query-string cache-key variance,
// not designed yet), /cart and /location ('use client', nothing to
// prerender), /login and /not-live (never rewritten to the buy tree).
const GUEST_ISR_PUBLIC_EXACT = new Set(['/']);
const GUEST_ISR_PUBLIC_PREFIXES = ['/product/', '/category/', '/brand/', '/list/'];

export function isGuestIsrPagePath(pathname: string): boolean {
  if (GUEST_ISR_PUBLIC_EXACT.has(pathname)) return true;
  return GUEST_ISR_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// The public → `/buy/g/<tenantSlug>/...` mapping for guest-ISR-eligible
// pages is NOT expressed here — middleware deliberately does not compute or
// rewrite to that path (a middleware-computed NextResponse.rewrite() defeats
// Next's ISR caching for the destination, confirmed: vercel/next.js#83862).
// The actual mapping lives as static `rewrites().afterFiles` entries in
// next.config.js, which Next's router resolves natively before dynamic-route
// matching. isGuestIsrPagePath above is still the source of truth for WHICH
// paths are guest-ISR-eligible; keep it in sync with next.config.js's rule
// list by hand if either changes.

export function isStorefrontPagePath(pathname: string): boolean {
  if (toInternalBuyPath(pathname)) return true;
  if (pathname.startsWith('/buy/')) return true;
  return pathname === '/not-live' || pathname === '/login';
}

export function isGuestCatalogApiPath(pathname: string): boolean {
  if (pathname === '/api/buyer/catalog' || pathname.startsWith('/api/buyer/catalog/')) return true;
  if (pathname === '/api/buyer/brands' || pathname === '/api/buyer/categories') return true;
  if (pathname === '/api/buyer/search' || pathname.startsWith('/api/buyer/search/')) return true;
  if (pathname.startsWith('/api/buyer/products/')) return true;
  if (pathname === '/api/buyer/home/reco') return true;
  if (pathname === '/api/buyer/recommendations') return true;
  if (pathname.startsWith('/api/buyer/reco/category/') || pathname.startsWith('/api/buyer/reco/brand/')) return true;
  if (pathname === '/api/buyer/me') return true;
  if (pathname === '/api/buyer/nearest-location') return true;
  return false;
}

export function isGuestSearchApiPath(pathname: string, search = ''): boolean {
  if (pathname === '/api/buyer/search' || pathname.startsWith('/api/buyer/search/')) return true;
  return pathname === '/api/buyer/catalog' && /(?:^|[?&])search=/.test(search);
}

export function isGuestRateLimitedPath(pathname: string): boolean {
  if (isGuestCatalogApiPath(pathname)) return true;
  return isGuestStorefrontPagePath(pathname);
}
