import { supabaseAdmin } from '@/lib/supabase';

const BROWSE_LIMIT_PER_MINUTE = 60;
const SEARCH_LIMIT_PER_MINUTE = 20;
// Global (not per-slug) — catches a phone probing MANY different subdomains
// looking for real tenants, which the per-(ip,slug) limits below can't see
// since each individual slug never repeats enough to trip them.
const ENUMERATION_LIMIT_PER_MINUTE = 20;
const WINDOW_MS = 60_000;

export type PublicCatalogRateKind = 'browse' | 'search' | 'enumeration';

export interface PublicCatalogRateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

function limitFor(kind: PublicCatalogRateKind): number {
  if (kind === 'search') return SEARCH_LIMIT_PER_MINUTE;
  if (kind === 'enumeration') return ENUMERATION_LIMIT_PER_MINUTE;
  return BROWSE_LIMIT_PER_MINUTE;
}

export function publicCatalogRateLimitKey(
  ip: string,
  slug: string,
  kind: PublicCatalogRateKind,
): string {
  return `${kind}:${ip}:${slug}`;
}

export function clientIpFromRequest(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Fixed 60s window per IP + tenant slug, counted atomically in ONE round trip
 * (app.consume_public_catalog_rate_limit, migration 20260920145507). The previous
 * SELECT-then-UPSERT cost two PostgREST calls on every guest request from middleware and lost
 * updates under concurrency. Fail-open if the store is unavailable so a limiter outage does not
 * take down the catalog; 429s still fire when the counter is over limit.
 */
export async function consumePublicCatalogRateLimit(
  ip: string,
  slug: string,
  kind: PublicCatalogRateKind,
  now = Date.now(),
): Promise<PublicCatalogRateLimitResult> {
  void now;
  const retryAfterSec = Math.ceil(WINDOW_MS / 1000);
  if (!supabaseAdmin) return { ok: true, retryAfterSec: 0 };

  try {
    const { data, error } = await supabaseAdmin.schema('app').rpc('consume_public_catalog_rate_limit', {
      p_key: publicCatalogRateLimitKey(ip, slug, kind),
      p_limit: limitFor(kind),
      p_window_seconds: WINDOW_MS / 1000,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean } | null | undefined;
    if (row && row.allowed === false) {
      return { ok: false, retryAfterSec };
    }
    return { ok: true, retryAfterSec: 0 };
  } catch (error) {
    console.error('[public-catalog-rate-limit]', error);
    return { ok: true, retryAfterSec: 0 };
  }
}

/** IP-only bucket (fixed pseudo-slug) — deliberately ignores which slug was
 * probed, since the whole point is catching one IP hitting many different
 * (mostly nonexistent) tenant subdomains, not repeated hits on one. */
export async function consumeEnumerationRateLimit(ip: string, now = Date.now()): Promise<PublicCatalogRateLimitResult> {
  return consumePublicCatalogRateLimit(ip, '__enumeration__', 'enumeration', now);
}

export function tooManyRequestsResponse(retryAfterSec: number): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: {
      'Retry-After': String(Math.max(1, retryAfterSec)),
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
