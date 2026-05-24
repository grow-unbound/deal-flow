import type { NextRequest } from 'next/server';

export interface JWTClaims {
  tenant_id: string | null;
  role: string | null;
  buyer_id: string | null;
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Decodes the payload section of a JWT without signature verification.
 * Safe to call after Supabase's getUser() has already validated the token.
 */
export function decodeJWTPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Malformed JWT: missing payload segment');
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Reads the verified JWT claims that middleware injected as request headers.
 * Never call this with raw client-supplied headers — only headers set by middleware.ts.
 */
export function extractVerifiedClaims(request: NextRequest): JWTClaims {
  return {
    tenant_id: request.headers.get('x-verified-tenant-id'),
    role: request.headers.get('x-verified-role'),
    buyer_id: request.headers.get('x-verified-buyer-id'),
  };
}

/**
 * Asserts that claims contain a valid tenant_id, optionally matching expectedTenantId.
 * Throws AuthorizationError on any mismatch — callers should return 403.
 */
export function assertTenantClaim(
  claims: JWTClaims,
  expectedTenantId?: string,
): void {
  if (!claims.tenant_id) {
    throw new AuthorizationError('JWT missing tenant_id claim');
  }
  if (expectedTenantId && claims.tenant_id !== expectedTenantId) {
    throw new AuthorizationError(
      `Tenant mismatch: expected ${expectedTenantId}, got ${claims.tenant_id}`,
    );
  }
}
