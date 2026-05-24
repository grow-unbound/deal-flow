'use client';

import { useAuth } from '@/contexts/AuthContext';
import { ROLES, SELLER_ROLES, BUYER_ROLES, type Role } from '@/constants';

export interface UseRoleReturn {
  role: Role | null;
  isSellerAdmin: boolean;
  isSellerAssistant: boolean;
  isBuyerAdmin: boolean;
  isBuyerAssistant: boolean;
  isSeller: boolean;
  isBuyer: boolean;
  /** Returns true if the current role is included in the provided list */
  can: (roles: Role[]) => boolean;
}

/**
 * Reads the current user's role from the JWT claim (via AuthContext.tenantProfile).
 * Use this as the single source of truth for role-based UI gating.
 */
export function useRole(): UseRoleReturn {
  const { tenantProfile } = useAuth();
  const role = tenantProfile?.role ?? null;

  return {
    role,
    isSellerAdmin: role === ROLES.SELLER_ADMIN,
    isSellerAssistant: role === ROLES.SELLER_ASSISTANT,
    isBuyerAdmin: role === ROLES.BUYER_ADMIN,
    isBuyerAssistant: role === ROLES.BUYER_ASSISTANT,
    isSeller: role !== null && (SELLER_ROLES as readonly string[]).includes(role),
    isBuyer: role !== null && (BUYER_ROLES as readonly string[]).includes(role),
    can: (roles: Role[]) => role !== null && roles.includes(role),
  };
}
