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
