'use client';

import { apiFetch } from '@/lib/api-fetch';

export async function loadCalloutRows<T, TRow>(
  url: string,
  selectRows: (payload: T) => Promise<TRow[]> | TRow[],
) {
  // Client-side fetch (browser HTTP cache, scoped to this browser/session — no
  // cross-tenant risk). Deliberately omits `cache: 'no-store'` so the browser
  // honors the API route's Cache-Control (private, max-age=15/30/60) response
  // header on quick back/forward navigations instead of always refetching.
  const response = await apiFetch(url, {});
  if (!response.ok) {
    throw new Error(`Failed to load callout rows from ${url}`);
  }

  const payload = await response.json() as T;
  return await selectRows(payload);
}
