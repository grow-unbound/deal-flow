/**
 * Guest-only, CDN-cacheable twins of the anonymous-safe `/api/buyer/*` catalog GETs
 * (Phase 9, specs/db-perf-recovery-2026-09-20.md).
 *
 * `/api/buyer/*` responses are `private` because the same URL serves different data per buyer.
 * A shared cache keyed on URL must never see those. Anonymous storefront visitors instead call
 * `/api/public/g/*`: a distinct URL space whose handler ignores every credential and always
 * resolves the guest view of the Host-verified tenant, so `public, s-maxage` is safe there.
 *
 * Pure module: used by the client (`apiFetch`) and by the route handler and middleware.
 */

export const GUEST_PUBLIC_API_PREFIX = '/api/public/g/';

// Exact upstream paths (no trailing segments beyond the listed id) that have a guest twin.
// Tokenized flows (`/api/buyer/catalog/<share_token>`) deliberately do NOT match.
const GUEST_TWIN_PATHS: RegExp[] = [
  /^\/api\/buyer\/(catalog|brands|categories|search|recommendations|me)$/,
  /^\/api\/buyer\/home\/reco$/,
  /^\/api\/buyer\/(products|product-families)\/[^/?#]+$/,
  /^\/api\/buyer\/reco\/(category|brand)\/[^/?#]+$/,
];

// Query params that make a response non-public (per-link / per-campaign visibility).
const NON_PUBLIC_PARAMS = ['share_token', 'campaign_id'];

export function hasNonPublicParams(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return NON_PUBLIC_PARAMS.some((name) => params.has(name));
}

/** `/api/buyer/catalog?limit=40` -> `/api/public/g/catalog?limit=40`; null when there is no safe twin. */
export function toGuestPublicUrl(url: string): string | null {
  if (!url.startsWith('/api/buyer/')) return null;
  const queryAt = url.indexOf('?');
  const path = queryAt === -1 ? url : url.slice(0, queryAt);
  const search = queryAt === -1 ? '' : url.slice(queryAt);
  if (!GUEST_TWIN_PATHS.some((re) => re.test(path))) return null;
  if (hasNonPublicParams(search)) return null;
  return `${GUEST_PUBLIC_API_PREFIX}${path.slice('/api/buyer/'.length)}${search}`;
}

/** Inverse of the mapping, for the route handler: `catalog` -> `/api/buyer/catalog`. */
export function toBuyerUpstreamPath(subPath: string): string | null {
  const candidate = `/api/buyer/${subPath}`;
  return GUEST_TWIN_PATHS.some((re) => re.test(candidate)) ? candidate : null;
}

// ---------------------------------------------------------------------------------------------
// Query contract (cost control + delivery-location carrying)
// ---------------------------------------------------------------------------------------------
// A shared cache keys on the full URL, so an unbounded query string lets anyone bypass the cache with
// `?x=<random>` and force a database-backed origin render per request. The guest twin therefore ONLY
// accepts the parameters the storefront actually sends and rejects everything else before any
// database work happens. `wh` carries the visitor's delivery warehouse: the private route reads it
// from the delivery cookie, which a cacheable route must never read (cookies are not part of a CDN
// cache key), so it travels in the URL instead and becomes part of the cache key.

export const WAREHOUSE_PARAM = 'wh';

type QueryRule = { params: readonly string[] };

const CATALOG_PARAMS = ['limit', 'offset', 'search', 'category_id', 'brand_id', 'tenant_product_id', 'campaign_id', 'share_token', WAREHOUSE_PARAM] as const;

const QUERY_RULES: Array<{ re: RegExp; rule: QueryRule }> = [
  { re: /^catalog$/, rule: { params: CATALOG_PARAMS } },
  { re: /^search$/, rule: { params: ['q', 'scope', 'limit', WAREHOUSE_PARAM] } },
  { re: /^recommendations$/, rule: { params: ['product_id', WAREHOUSE_PARAM] } },
  { re: /^(brands|categories)$/, rule: { params: ['campaign_id', 'share_token', WAREHOUSE_PARAM] } },
];
const DEFAULT_RULE: QueryRule = { params: [WAREHOUSE_PARAM] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT = 100;
const MAX_OFFSET = 20_000;

/** Returns an error code for the first invalid parameter, or null when the query is acceptable. */
export function validateGuestPublicQuery(subPath: string, params: URLSearchParams): string | null {
  const rule = QUERY_RULES.find((entry) => entry.re.test(subPath))?.rule ?? DEFAULT_RULE;
  for (const [name, value] of params.entries()) {
    if (!rule.params.includes(name)) return `unsupported_param:${name}`;
    if (name === WAREHOUSE_PARAM && !UUID_RE.test(value)) return 'invalid_param:wh';
    if ((name === 'limit' || name === 'offset') && !/^\d{1,6}$/.test(value)) return `invalid_param:${name}`;
    if (name === 'offset' && Number(value) > MAX_OFFSET) return 'invalid_param:offset';
    if ((name === 'search' || name === 'q') && value.length > MAX_TEXT) return `invalid_param:${name}`;
    if (name === 'scope' && value !== 'catalog') return 'invalid_param:scope';
    if (['category_id', 'brand_id', 'tenant_product_id', 'campaign_id', 'share_token', 'product_id'].includes(name) && !ID_RE.test(value)) {
      return `invalid_param:${name}`;
    }
  }
  return null;
}

/** Adds the visitor's delivery warehouse (when known and valid) to a guest twin URL. */
export function appendWarehouseParam(guestUrl: string, warehouseId: string | null | undefined): string {
  if (!warehouseId || !UUID_RE.test(warehouseId) || !guestUrl.startsWith(GUEST_PUBLIC_API_PREFIX)) return guestUrl;
  const queryAt = guestUrl.indexOf('?');
  const path = queryAt === -1 ? guestUrl : guestUrl.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : guestUrl.slice(queryAt + 1));
  params.set(WAREHOUSE_PARAM, warehouseId);
  return `${path}?${params.toString()}`;
}
