'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function useResolvedPrice(tenantProductId: string | null, buyerId: string | null, qty = 1) {
  return useQuery({
    queryKey: ['resolved-price', tenantProductId, buyerId, qty],
    queryFn: async (): Promise<{ price: number | null }> => {
      const supabase = createClientComponentClient();
      const { data, error } = await (
        supabase as ReturnType<typeof createClientComponentClient> & {
          schema: (schema: string) => ReturnType<typeof createClientComponentClient>;
        }
      )
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
