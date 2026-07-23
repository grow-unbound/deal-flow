'use client';

import { useQuery } from '@tanstack/react-query';
import { apiPost } from '@/lib/api-fetch';
import { useDebounce } from '@/hooks/useDebounce';
import type { BuyerMembershipRules, MembershipEntityType, ProductMembershipRules } from '@/lib/zod';

export interface MembershipPreviewResult {
  count: number;
  sample_names: string[];
}

/**
 * Live-count preview for the Automatic membership filter panel. Debounces filter changes and
 * calls the shared /api/membership/preview endpoint, reused across all four surfaces
 * (Customer Groups, Pricelists, Campaign buyers, Campaign products) in both the Create/Edit
 * overlay and the Details tab. Replaces CohortPreviewPanel's hand-rolled local
 * useState/useEffect debounce with one reusable TanStack Query hook.
 */
export function useMembershipPreviewCount(
  entityType: MembershipEntityType,
  rules: BuyerMembershipRules | ProductMembershipRules,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 500 } = options;
  const debouncedRules = useDebounce(rules, debounceMs);

  return useQuery<MembershipPreviewResult>({
    queryKey: ['membership-preview', entityType, debouncedRules],
    queryFn: async () => {
      const response = await apiPost('/api/membership/preview', { entity_type: entityType, rules: debouncedRules });
      if (!response.ok) {
        throw new Error('Failed to load preview count');
      }
      return response.json();
    },
    enabled,
    staleTime: 0,
    gcTime: 60_000,
    placeholderData: (previous) => previous,
  });
}
