'use client';

import { useAuth } from '@/contexts/AuthContext';
import { SELLER_ROLES } from '@/constants';

export interface UseBuyerSessionReturn {
  /** Effective role to use for buyer UI gating — 'buyer_admin' when proxied via seller */
  effectiveBuyerRole: 'buyer_admin' | 'buyer_assistant' | null;
  /** True if the current user is a seller accessing /buy/* as proxied buyer_admin */
  isBuyerProxied: boolean;
  /** buyer_id from JWT — null for seller-proxied access */
  currentBuyerId: string | null;
}

/**
 * Use inside /buy/* route components to read the effective buyer role.
 * Sellers are treated as buyer_admin (proxy mode); real buyers get their own role.
 */
export function useBuyerSession(): UseBuyerSessionReturn {
  const { tenantProfile, currentBuyerId } = useAuth();
  const role = tenantProfile?.role ?? null;

  const isSeller = role !== null && (SELLER_ROLES as readonly string[]).includes(role);

  const effectiveBuyerRole: 'buyer_admin' | 'buyer_assistant' | null = isSeller
    ? 'buyer_admin'
    : role === 'buyer_admin' || role === 'buyer_assistant'
      ? role
      : null;

  return {
    effectiveBuyerRole,
    isBuyerProxied: isSeller,
    currentBuyerId,
  };
}
