import { supabaseAdmin } from '@/lib/supabase';

// Limits are by COST, not count. Cheap, cacheable storefront reads (page navigations, catalog pages,
// brands, categories, product detail) are NOT counted here at all: the CDN absorbs repeats, the edge
// firewall rule is the flood backstop, and a per-request database round trip would cost more than the
// request it protects. What is counted is the expensive, uncacheable work: SEARCH (unique free-text
// queries that always miss the cache). BROWSE stays only for the branding endpoint, whose origin hits
// are already cache misses. Keys include a device fingerprint (see deviceKeyFromHeaders) because
// mobile carriers and offices put many real visitors behind one public IP.
const BROWSE_LIMIT_PER_MINUTE = 180;
const SEARCH_LIMIT_PER_MINUTE = 60;
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
 * IP plus a short hash of User-Agent + Accept-Language. Distinguishes different devices behind one
 * carrier-grade NAT / office IP so one heavy searcher does not throttle everyone sharing the address.
 * It is a fairness aid, not an anti-abuse control (an attacker can vary the headers): the edge
 * firewall rule remains the flood backstop and the enumeration limiter stays IP-only.
 */
export function deviceKeyFromHeaders(headers: Headers): string {
  const ip = clientIpFromRequest(headers);
  const fingerprint = `${headers.get('user-agent') ?? ''}|${headers.get('accept-language') ?? ''}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash ^= fingerprint.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${ip}~${hash.toString(36)}`;
}

/**
 * Fixed 60s window per IP + tenant slug, counted atomically in ONE round trip
 * (app.consume_public_catalog_rate_limit, migrations 20260920145507 + 20260921005743). The previous
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
  const defaultRetryAfterSec = Math.ceil(WINDOW_MS / 1000);
  if (!supabaseAdmin) return { ok: true, retryAfterSec: 0 };

  try {
    const { data, error } = await supabaseAdmin.schema('app').rpc('consume_public_catalog_rate_limit', {
      p_key: publicCatalogRateLimitKey(ip, slug, kind),
      p_limit: limitFor(kind),
      p_window_seconds: WINDOW_MS / 1000,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_after_seconds?: number } | null | undefined;
    if (row && row.allowed === false) {
      // Seconds left in the current window (migration 20260921005743); a full window if the column is absent.
      const remaining = Number(row.retry_after_seconds);
      return { ok: false, retryAfterSec: Number.isFinite(remaining) && remaining > 0 ? remaining : defaultRetryAfterSec };
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

const RATE_LIMIT_MESSAGE = "You're browsing very quickly. Please wait a moment and try again.";

/**
 * 429 for the storefront limiters. `api` callers (fetch/XHR) get JSON with a human message and the
 * exact wait; `page` navigations get a small page that retries by itself, instead of a bare
 * "Too Many Requests" text screen.
 */
export function tooManyRequestsResponse(retryAfterSec: number, variant: 'api' | 'page' = 'page'): Response {
  const wait = Math.max(1, Math.ceil(retryAfterSec));
  const headers = { 'Retry-After': String(wait), 'Cache-Control': 'private, no-store' };

  if (variant === 'api') {
    return new Response(
      JSON.stringify({ error: 'rate_limited', message: RATE_LIMIT_MESSAGE, retry_after: wait }),
      { status: 429, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${wait}"><title>One moment…</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#faf8f5;color:#1f2933}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#52606d;line-height:1.5}</style></head><body><main><h1>One moment…</h1><p>${RATE_LIMIT_MESSAGE} This page will retry automatically in ${wait} second${wait === 1 ? '' : 's'}.</p></main></body></html>`;
  return new Response(html, { status: 429, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
