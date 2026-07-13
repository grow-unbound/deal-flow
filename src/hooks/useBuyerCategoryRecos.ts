'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { BuyerCatalogItem } from '@/types/buyer';

export function useBuyerCategoryRecos(categoryId: string) {
  return useQuery<BuyerCatalogItem[]>({
    queryKey: ['reco-category', categoryId],
    queryFn: async () => {
      const res = await apiFetch(`/api/buyer/reco/category/${categoryId}`);
      if (!res.ok) return [];
      return res.json() as Promise<BuyerCatalogItem[]>;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Boolean(categoryId),
  });
}

export function useBuyerBrandRecos(brandId: string) {
  return useQuery<BuyerCatalogItem[]>({
    queryKey: ['reco-brand', brandId],
    queryFn: async () => {
      const res = await apiFetch(`/api/buyer/reco/brand/${brandId}`);
      if (!res.ok) return [];
      return res.json() as Promise<BuyerCatalogItem[]>;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: Boolean(brandId),
  });
}
