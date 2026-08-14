/**
 * Single source of truth for buyer PWA route taxonomy (tab bar vs deep screens).
 */

export const BUYER_LANDING_ROUTES = [
  '/buy/home',
  '/buy/orders',
  '/buy/profile',
] as const;

export type BuyerLandingRoute = (typeof BUYER_LANDING_ROUTES)[number];

/** Prefixes: hide tab bar when pathname starts with one of these. */
export const BUYER_DEEP_PREFIXES = [
  '/buy/product/',
  '/buy/home/category/',
  '/buy/home/brand/',
  '/buy/home/list/',
  '/buy/orders/',
  '/buy/invoices/',
  '/buy/estimates/',
  '/buy/search',
  '/buy/location',
] as const;

/** Exact deep roots (and optional deeper paths under them). */
export const BUYER_DEEP_EXACT_ROOTS = ['/buy/cart', '/buy/order-placed', '/buy/estimate-placed', '/buy/promotions'] as const;

/** Seller preview gates — hide tab bar / cart chrome until setup completes. */
export const BUYER_PREVIEW_SETUP_PREFIX = '/buy/preview/' as const;

export function isBuyerPreviewSetupRoute(pathname: string): boolean {
  return pathname.startsWith(BUYER_PREVIEW_SETUP_PREFIX);
}

export function isBuyerDeepRoute(pathname: string): boolean {
  for (const root of BUYER_DEEP_EXACT_ROOTS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return true;
  }
  return BUYER_DEEP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isBuyerLandingRoute(pathname: string): boolean {
  return (BUYER_LANDING_ROUTES as readonly string[]).includes(pathname);
}

/** Desktop breadcrumbs appear on deep buyer pages, plus the Orders/Profile landing tabs (never Home). */
const BUYER_BREADCRUMB_LANDING_ROUTES = ['/buy/orders', '/buy/profile'] as const;

export function shouldShowBuyerDesktopBreadcrumbs(pathname: string): boolean {
  return isBuyerDeepRoute(pathname) || (BUYER_BREADCRUMB_LANDING_ROUTES as readonly string[]).includes(pathname);
}

/** Hide tab bar / bottom padding (preview gates, not stack "deep" screens). */
export function isBuyerChromelessRoute(pathname: string): boolean {
  return isBuyerPreviewSetupRoute(pathname);
}

const BUYER_CART_PILL_EXACT = ['/buy/home'] as const;

const BUYER_CART_PILL_PREFIXES = [
  '/buy/home/category/',
  '/buy/home/brand/',
  '/buy/home/list/',
  '/buy/product/',
] as const;

/** Home + catalog tree: show floating View Cart pill when cart is non-empty. */
export function isBuyerCartPillRoute(pathname: string): boolean {
  if ((BUYER_CART_PILL_EXACT as readonly string[]).includes(pathname)) return true;
  return BUYER_CART_PILL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export interface BuyerSearchHrefParams {
  scope?: string;
  q?: string;
  category_id?: string;
  brand_id?: string;
  campaign_id?: string;
}

export function buildBuyerLocationHref(returnTo: string): string {
  return `/buy/location?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Build `/buy/search` URL with query params for overlay search. */
export function buildBuyerSearchHref(params: BuyerSearchHrefParams): string {
  const sp = new URLSearchParams();
  if (params.scope) sp.set('scope', params.scope);
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.category_id) sp.set('category_id', params.category_id);
  if (params.brand_id) sp.set('brand_id', params.brand_id);
  if (params.campaign_id) sp.set('campaign_id', params.campaign_id);
  const qs = sp.toString();
  return qs ? `/buy/search?${qs}` : '/buy/search';
}
