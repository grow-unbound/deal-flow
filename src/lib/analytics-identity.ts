'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';

export interface SellerAnalyticsIds {
  seller_id: string | null;
  tenant_id: string | null;
}

export interface BuyerAnalyticsIds {
  buyer_id: string | null;
  tenant_id: string | null;
}

/** seller_id + tenant_id for the currently signed-in seller user, for stamping client-side capture() properties. */
export function useSellerAnalyticsIds(): SellerAnalyticsIds {
  const { user, currentTenantId } = useAuth();
  return useMemo(
    () => ({ seller_id: user?.id ?? null, tenant_id: currentTenantId ?? null }),
    [user?.id, currentTenantId],
  );
}

/** buyer_id + tenant_id for the current buyer session, for stamping client-side capture() properties. */
export function useBuyerAnalyticsIds(): BuyerAnalyticsIds {
  const { data: meData } = useBuyerMe();
  return useMemo(
    () => ({ buyer_id: meData?.buyer_id ?? null, tenant_id: meData?.tenant.id ?? null }),
    [meData?.buyer_id, meData?.tenant.id],
  );
}
