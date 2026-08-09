import type { JWTClaims } from '@/lib/auth';

export interface SellerAnalyticsIds {
  seller_id: string | null;
  tenant_id: string | null;
}

/** tenant_id + seller_id (acting user) from verified server-side JWT claims, for stamping server capture() properties. */
export function withTenantSellerIds(claims: Pick<JWTClaims, 'tenant_id' | 'sub'>): SellerAnalyticsIds {
  return { tenant_id: claims.tenant_id ?? null, seller_id: claims.sub ?? null };
}
