'use client';

import type { Query } from '@tanstack/react-query';

const BUYER_REFRESH_QUERY_PREFIXES = ['buyer-', 'reco-'] as const;
const BUYER_REFRESH_QUERY_KEYS = new Set(['cart-bundles']);

export function isBuyerRefreshQueryKey(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  if (typeof first !== 'string') return false;
  if (BUYER_REFRESH_QUERY_KEYS.has(first)) return true;
  return BUYER_REFRESH_QUERY_PREFIXES.some((prefix) => first.startsWith(prefix));
}

export function isActiveBuyerRefreshQuery(query: Query): boolean {
  return query.getObserversCount() > 0 && isBuyerRefreshQueryKey(query.queryKey);
}
