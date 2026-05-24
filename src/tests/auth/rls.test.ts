/**
 * Integration tests for EP-11-002: RLS policy helpers and role guards.
 *
 * These tests exercise the auth helper functions (src/lib/auth.ts) with
 * mocked JWT payloads to verify that role and tenant claim extraction behaves
 * correctly for all four roles. The actual SQL-level policy enforcement is
 * tested in tests/rls_policies.sql (pgTAP).
 */

import { NextRequest } from 'next/server';
import {
  decodeJWTPayload,
  extractVerifiedClaims,
  assertTenantClaim,
  AuthorizationError,
  type JWTClaims,
} from '@/lib/auth';

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const BUYER_A  = 'cccccccc-0000-0000-0000-000000000003';

function buildJWT(payload: object): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

function makeRequest(headers: Record<string, string | null>): NextRequest {
  const req = new NextRequest('http://localhost/dashboard');
  Object.entries(headers).forEach(([k, v]) => {
    if (v !== null) req.headers.set(k, v);
  });
  return req;
}

// ────────────────────────────────────────────────────────────────────────────
// Seller role — all four seller scenarios
// ────────────────────────────────────────────────────────────────────────────
describe('seller_admin JWT claims', () => {
  const token = buildJWT({ tenant_id: TENANT_A, role: 'seller_admin' });

  it('extracts tenant_id and role', () => {
    const payload = decodeJWTPayload(token);
    expect(payload.tenant_id).toBe(TENANT_A);
    expect(payload.role).toBe('seller_admin');
  });

  it('has no buyer_id claim', () => {
    const payload = decodeJWTPayload(token);
    expect(payload.buyer_id).toBeUndefined();
  });

  it('passes assertTenantClaim for own tenant', () => {
    const claims: JWTClaims = { tenant_id: TENANT_A, role: 'seller_admin', buyer_id: null };
    expect(() => assertTenantClaim(claims, TENANT_A)).not.toThrow();
  });

  it('rejects assertTenantClaim for different tenant', () => {
    const claims: JWTClaims = { tenant_id: TENANT_A, role: 'seller_admin', buyer_id: null };
    expect(() => assertTenantClaim(claims, TENANT_B)).toThrow(AuthorizationError);
  });
});

describe('seller_assistant JWT claims', () => {
  const token = buildJWT({ tenant_id: TENANT_A, role: 'seller_assistant' });

  it('role is seller_assistant', () => {
    expect(decodeJWTPayload(token).role).toBe('seller_assistant');
  });

  it('has same tenant_id as admin', () => {
    expect(decodeJWTPayload(token).tenant_id).toBe(TENANT_A);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Buyer role — buyer_id is present and non-null
// ────────────────────────────────────────────────────────────────────────────
describe('buyer_admin JWT claims', () => {
  const token = buildJWT({ tenant_id: TENANT_A, role: 'buyer_admin', buyer_id: BUYER_A });

  it('extracts buyer_id', () => {
    const payload = decodeJWTPayload(token);
    expect(payload.buyer_id).toBe(BUYER_A);
  });

  it('tenant_id is the distributor tenant, not buyer tenant', () => {
    expect(decodeJWTPayload(token).tenant_id).toBe(TENANT_A);
  });

  it('passes assertTenantClaim for tenant A', () => {
    const claims: JWTClaims = { tenant_id: TENANT_A, role: 'buyer_admin', buyer_id: BUYER_A };
    expect(() => assertTenantClaim(claims)).not.toThrow();
  });
});

describe('buyer_assistant JWT claims', () => {
  const token = buildJWT({ tenant_id: TENANT_A, role: 'buyer_assistant', buyer_id: BUYER_A });

  it('role is buyer_assistant', () => {
    expect(decodeJWTPayload(token).role).toBe('buyer_assistant');
  });

  it('still carries buyer_id', () => {
    expect(decodeJWTPayload(token).buyer_id).toBe(BUYER_A);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Verified headers (set by middleware from validated JWT)
// ────────────────────────────────────────────────────────────────────────────
describe('extractVerifiedClaims', () => {
  it('extracts seller claims with no buyer_id', () => {
    const req = makeRequest({
      'x-verified-tenant-id': TENANT_A,
      'x-verified-role': 'seller_admin',
      'x-verified-buyer-id': null,
    });
    const claims = extractVerifiedClaims(req);
    expect(claims).toEqual<JWTClaims>({
      tenant_id: TENANT_A,
      role: 'seller_admin',
      buyer_id: null,
    });
  });

  it('extracts buyer claims with buyer_id', () => {
    const req = makeRequest({
      'x-verified-tenant-id': TENANT_A,
      'x-verified-role': 'buyer_admin',
      'x-verified-buyer-id': BUYER_A,
    });
    const claims = extractVerifiedClaims(req);
    expect(claims.buyer_id).toBe(BUYER_A);
    expect(claims.role).toBe('buyer_admin');
  });

  it('returns null for all claims when headers absent', () => {
    const req = makeRequest({});
    const claims = extractVerifiedClaims(req);
    expect(claims.tenant_id).toBeNull();
    expect(claims.role).toBeNull();
    expect(claims.buyer_id).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cross-tenant guard: assertTenantClaim mirrors SQL RLS policy logic
// ────────────────────────────────────────────────────────────────────────────
describe('assertTenantClaim cross-tenant guard', () => {
  it('blocks when JWT tenant_id is null (unauthenticated / no claim)', () => {
    const claims: JWTClaims = { tenant_id: null, role: 'seller_admin', buyer_id: null };
    expect(() => assertTenantClaim(claims)).toThrow(AuthorizationError);
  });

  it('blocks when expected tenant differs from JWT tenant (tenant B tries to act on tenant A resource)', () => {
    const claimsB: JWTClaims = { tenant_id: TENANT_B, role: 'seller_admin', buyer_id: null };
    expect(() => assertTenantClaim(claimsB, TENANT_A)).toThrow(AuthorizationError);
    expect(() => assertTenantClaim(claimsB, TENANT_A)).toThrow('Tenant mismatch');
  });

  it('allows when JWT tenant matches resource tenant', () => {
    const claimsA: JWTClaims = { tenant_id: TENANT_A, role: 'seller_admin', buyer_id: null };
    expect(() => assertTenantClaim(claimsA, TENANT_A)).not.toThrow();
  });
});
