/**
 * True for Next.js router prefetch requests (viewport `<Link>` prefetch and `router.prefetch`).
 *
 * These are speculative background fetches, not visitor actions: one guest landing page renders
 * dozens of brand/category/product tiles and each prefetches its route. They must not consume a
 * visitor's rate-limit budget (Phase 9 follow-up, specs/db-perf-recovery-2026-09-20.md).
 * The header is client-controllable, so callers must only use this to skip the per-visitor DB
 * limiter on cheap PAGE routes, never on API routes (the edge firewall rule is the flood backstop).
 */
export function isNextPrefetchRequest(headers: Pick<Headers, 'get'>): boolean {
  const nextPrefetch = headers.get('next-router-prefetch');
  if (nextPrefetch === '1' || nextPrefetch === 'true') return true;
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`.toLowerCase();
  return purpose.includes('prefetch');
}
