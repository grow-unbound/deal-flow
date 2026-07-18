'use client';

import { apiFetch } from '@/lib/api-fetch';

export async function loadCalloutRows<T, TRow>(
  url: string,
  selectRows: (payload: T) => Promise<TRow[]> | TRow[],
) {
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load callout rows from ${url}`);
  }

  const payload = await response.json() as T;
  return await selectRows(payload);
}
