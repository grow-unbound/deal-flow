import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { type JWTClaims } from '@/lib/auth';
import { normalizeLocationIds } from '@/lib/server/seller-location-access';

function claimsFromHeaders(h: Headers): JWTClaims {
  const rawLocationIds = h.get('x-verified-location-ids');
  const locationIds = (() => {
    if (!rawLocationIds) return null;
    try {
      return normalizeLocationIds(JSON.parse(rawLocationIds) as unknown);
    } catch {
      return null;
    }
  })();

  return {
    sub: h.get('x-verified-user-id'),
    tenant_id: h.get('x-verified-tenant-id'),
    role: h.get('x-verified-role'),
    buyer_id: h.get('x-verified-buyer-id'),
    location_ids: locationIds,
  };
}

/**
 * Resolves seller JWT claims for Server Components.
 * Seller routes are protected by middleware, which validates the Supabase session
 * and forwards verified claims as x-verified-* headers for Server Components.
 */
export async function getSellerServerClaims(): Promise<JWTClaims> {
  const h = await headers();
  return claimsFromHeaders(h);
}

/** Ensures an authenticated seller tenant context; redirects to /login when missing. */
export async function requireSellerServerTenantId(): Promise<string> {
  const claims = await getSellerServerClaims();

  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
    redirect('/login');
  }

  return claims.tenant_id;
}
