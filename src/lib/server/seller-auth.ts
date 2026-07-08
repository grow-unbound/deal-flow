import { ROLES } from '@/constants';
import type { JWTClaims } from '@/lib/auth';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

export type SellerAdminCheck =
  | { ok: true }
  | { ok: false; status: 401 | 403 };

export function assertSellerAdmin(claims: JWTClaims): SellerAdminCheck {
  if (!claims.tenant_id) {
    return { ok: false, status: 401 };
  }
  if (!claims.role?.startsWith('seller_')) {
    return { ok: false, status: 403 };
  }
  if (claims.role !== ROLES.SELLER_ADMIN) {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}

export async function requireSellerAdminServerClaims(): Promise<JWTClaims> {
  const claims = await getSellerServerClaims();
  const check = assertSellerAdmin(claims);
  if (!check.ok) {
    throw new Error(check.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
  }
  return claims;
}
