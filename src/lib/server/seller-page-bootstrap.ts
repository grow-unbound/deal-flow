import { cache } from 'react';
import { headers } from 'next/headers';

// React's cache() dedupes only within a single request/render pass — a fresh cache
// instance is created per request in Server Components, so THIS part cannot leak
// data across requests or tenants.
//
// The outbound self-fetch below is a different story. Despite `cache: 'no-store'`,
// Next's dev server (Turbopack) was observed serving a PREVIOUS request's response
// for these self-fetches — confirmed by switching tenants (via /login/select-context)
// and seeing the KPI tiles render the prior tenant's numbers one navigation behind,
// while a plain client-side fetch to the same API route and a direct DB query both
// returned correct, fresh, tenant-scoped data immediately. `cache: 'no-store'` stops
// Next's Data Cache from persisting a response, but did not stop this same-URL
// request from being coalesced with an in-flight/recent one. A cache-busting query
// param forces every self-fetch to be a genuinely distinct request, which fixed it.
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
  const separator = path.includes('?') ? '&' : '?';
  const url = `${proto}://${host}${path}${separator}_cb=${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const response = await fetch(url, {
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
