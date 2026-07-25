'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { CartBundlesResponse } from '@/types/buyer-reco';
import { BUYER_PRICE_QUERY_STALE_TIME, BUYER_PRICE_QUERY_GC_TIME } from '@/lib/query-navigation';

export type { CartBundle, CartBundleSlot, CartBundlesResponse } from '@/types/buyer-reco';

export function useCartBundles() {
  return useQuery<CartBundlesResponse>({
    queryKey: ['cart-bundles'],
    queryFn: async () => {
      const res = await apiFetch('/api/buyer/reco/cart-bundles');
      if (!res.ok) return { bundles: [] };
      return res.json() as Promise<CartBundlesResponse>;
    },
    staleTime: BUYER_PRICE_QUERY_STALE_TIME,
    gcTime: BUYER_PRICE_QUERY_GC_TIME,
  });
}
