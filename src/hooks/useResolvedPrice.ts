'use client';

import { useQuery } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function useResolvedPrice(tenantProductId: string | null, buyerId: string | null, qty = 1) {
  return useQuery({
    queryKey: ['resolved-price', tenantProductId, buyerId, qty],
    queryFn: async (): Promise<{ price: number | null }> => {
      const { data, error } = await supabaseBrowser
        .schema('app')
        .rpc('resolve_price', {
          p_tenant_product_id: tenantProductId,
          p_buyer_id: buyerId,
          p_qty: qty,
        });

      if (error) throw error;
      return { price: (typeof data === 'number' ? data : null) as number | null };
    },
    enabled: Boolean(tenantProductId && buyerId && qty > 0),
    staleTime: 30_000,
  });
}
