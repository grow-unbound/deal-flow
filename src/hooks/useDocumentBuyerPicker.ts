'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-fetch';

export interface DocumentBuyerPickerRow {
  id: string;
  business_name: string;
  place_of_supply: string;
}

export function useDocumentBuyerPicker(query: string, open: boolean) {
  return useQuery({
    queryKey: ['document-buyer-picker', query.trim(), open],
    queryFn: async (): Promise<DocumentBuyerPickerRow[]> => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      params.set('limit', '8');
      const res = await apiFetch(`/api/tenant/buyers/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to search buyers');
      }
      const json = (await res.json()) as { buyers: DocumentBuyerPickerRow[] };
      return json.buyers ?? [];
    },
    enabled: open,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
