import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { decodeJWTPayload, type JWTClaims } from '@/lib/auth';
import { normalizeLocationIds } from '@/lib/server/seller-location-access';
import type { Database } from '@/types/database';

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

function claimsFromJwtPayload(payload: Record<string, unknown>, sub: string | null): JWTClaims {
  const roleClaim = payload.user_role ?? payload.role;
  const role = typeof roleClaim === 'string' ? roleClaim : null;
  const locationIds = Array.isArray(payload.location_ids)
    ? payload.location_ids.filter((value): value is string => typeof value === 'string')
    : null;

  return {
    sub,
    tenant_id: typeof payload.tenant_id === 'string' ? payload.tenant_id : null,
    role,
    buyer_id: typeof payload.buyer_id === 'string' ? payload.buyer_id : null,
    location_ids: locationIds ? normalizeLocationIds(locationIds) : null,
  };
}

/**
 * Resolves seller JWT claims for Server Components.
 * Fast path: middleware-injected x-verified-* headers.
 * Fallback: Supabase session cookie (SPA navigations where headers may be absent).
 */
export async function getSellerServerClaims(): Promise<JWTClaims> {
  const h = await headers();
  const headerClaims = claimsFromHeaders(h);
  if (headerClaims.tenant_id) {
    return headerClaims;
  }

  const supabase = createServerComponentClient<Database>({ cookies: () => cookies() });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return headerClaims;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ...headerClaims, sub: user.id };
  }

  try {
    return claimsFromJwtPayload(decodeJWTPayload(session.access_token), user.id);
  } catch {
    return { ...headerClaims, sub: user.id };
  }
}

/** Ensures an authenticated seller tenant context; redirects to /login when missing. */
export async function requireSellerServerTenantId(): Promise<string> {
  const claims = await getSellerServerClaims();

  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
    redirect('/login');
  }

  return claims.tenant_id;
}
