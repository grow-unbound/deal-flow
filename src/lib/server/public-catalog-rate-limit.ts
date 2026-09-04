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
 * Sliding 60s window per IP + tenant slug. Fail-open if the store is unavailable
 * so a limiter outage does not take down the catalog; 429s still fire when the
 * counter is over limit.
 */
export async function consumePublicCatalogRateLimit(
  ip: string,
  slug: string,
  kind: PublicCatalogRateKind,
  now = Date.now(),
): Promise<PublicCatalogRateLimitResult> {
  const retryAfterSec = Math.ceil(WINDOW_MS / 1000);
  if (!supabaseAdmin) return { ok: true, retryAfterSec: 0 };

  const key = publicCatalogRateLimitKey(ip, slug, kind);
  const limit = limitFor(kind);
  const nowIso = new Date(now).toISOString();

  try {
    const { data: existing } = await supabaseAdmin
      .schema('app')
      .from('public_catalog_rate_limits')
      .select('hit_count, window_start')
      .eq('key', key)
      .maybeSingle();

    const windowStart = existing?.window_start ? new Date(existing.window_start as string).getTime() : 0;
    const inWindow = windowStart > now - WINDOW_MS;
    const nextCount = inWindow ? Number(existing?.hit_count ?? 0) + 1 : 1;

    await supabaseAdmin
      .schema('app')
      .from('public_catalog_rate_limits')
      .upsert(
        {
          key,
          hit_count: nextCount,
          window_start: inWindow && existing?.window_start ? existing.window_start : nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'key' },
      );

    if (nextCount > limit) {
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
