import { cache } from 'react';
import { headers } from 'next/headers';

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
 * Resolves buyer JWT claims for Server Components. Middleware validates the Supabase
 * session and forwards verified claims as x-verified-* headers (same pattern as
 * getSellerServerClaims). Returns nulls when the visitor is unauthenticated/preview —
 * callers must treat a missing tenant_id/buyer_id as "fall back to client fetch",
 * not redirect, since buyer routes also serve share-token and preview flows.
 */
export const getBuyerServerClaims = cache(async (): Promise<JWTClaims> => {
  const h = await headers();
  return claimsFromHeaders(h);
});
