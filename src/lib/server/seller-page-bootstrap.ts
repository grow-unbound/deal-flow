import { cache } from 'react';
import { headers } from 'next/headers';

// React's cache() dedupes only within a single request/render pass — a fresh cache
// instance is created per request in Server Components, so this cannot leak data
// across requests or tenants. It exists purely to collapse duplicate calls to the
// same bootstrap path within one page render (e.g. layout + page both requesting
// the same data). It intentionally does NOT persist across navigations — doing that
// via Next's shared fetch cache would require the cache key to explicitly encode
// tenant_id/user_id (it currently doesn't, since tenant scoping happens via the
// forwarded `cookie` header inside the handler, not the URL), so cross-navigation
// caching is deferred until that's threaded through explicitly.
export const fetchSellerPageBootstrap = cache(async function fetchSellerPageBootstrap<T>(
  path: string,
): Promise<{ data: T | null; status: number | null }> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) {
    return { data: null, status: null };
  }

  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const cookie = h.get('cookie') ?? '';

  try {
    const response = await fetch(`${proto}://${host}${path}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie,
      },
    });

    if (!response.ok) {
      return { data: null, status: response.status };
    }

    return {
      data: (await response.json()) as T,
      status: response.status,
    };
  } catch {
    return { data: null, status: null };
  }
}) as <T>(path: string) => Promise<{ data: T | null; status: number | null }>;
