/**
 * Cross-tenant RLS/RBAC isolation tests for the WhatsApp Broadcast feature
 * (Phases A-F).
 *
 * These tests exercise the auth helper functions (src/lib/auth.ts) with
 * mocked JWT payloads to verify that tenant/role claim extraction and
 * `assertTenantClaim` behave correctly for the WhatsApp broadcast surface,
 * mirroring the pattern in src/tests/auth/rls.test.ts.
 *
 * The actual SQL-level RLS policy enforcement (RLS ON/OFF per table, cross-
 * tenant SELECT/INSERT/UPDATE denial) is exercised at the Postgres level in
 * tests/rls_whatsapp_broadcast.sql (pgTAP) — that file is the source of
 * truth for the 5+ required cross-tenant isolation scenarios. This file adds
 * app-layer coverage that runs without a live Supabase/Postgres instance.
 */

import type { NextRequest } from 'next/server';
import {
  decodeJWTPayload,
  extractVerifiedClaims,
  assertTenantClaim,
  AuthorizationError,
  type JWTClaims,
} from '@/lib/auth';

const TENANT_A = 'aaaaaaaa-1111-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-2222-0000-0000-000000000002';
const BUYER_A = 'cccccccc-3333-0000-0000-000000000003';

function buildJWT(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

function makeRequest(headers: Record<string, string | null>): NextRequest {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NextRequest: NR } = require('next/server');
  const req = new NR('http://localhost/api/whatsapp/broadcasts');
  Object.entries(headers).forEach(([k, v]) => {
    if (v !== null) req.headers.set(k, v);
  });
  return req;
}

function claims(overrides: Partial<JWTClaims>): JWTClaims {
  return {
    sub: null,
    tenant_id: null,
    role: null,
    buyer_id: null,
    location_ids: null,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1 — app.whatsapp_messages: tenant A's claims must never satisfy a
// tenant-B-scoped assertion (mirrors the pgTAP SELECT-block test)
// ────────────────────────────────────────────────────────────────────────────
describe('whatsapp_messages: cross-tenant claim isolation', () => {
  it('seller_admin JWT for tenant A fails assertTenantClaim against tenant B', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c, TENANT_B)).toThrow(AuthorizationError);
  });

  it('seller_admin JWT for tenant A passes assertTenantClaim for its own tenant', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c, TENANT_A)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2 — app.whatsapp_broadcasts: cross-tenant block, and role is
// carried through so route-layer RBAC can reject seller_assistant writes
// (RLS itself enforces the seller_admin-only write in Postgres; this checks
// the claims plumbing the route depends on to reach that decision)
// ────────────────────────────────────────────────────────────────────────────
describe('whatsapp_broadcasts: cross-tenant + role claim isolation', () => {
  it('tenant A seller cannot assert claim against tenant B broadcast', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c, TENANT_B)).toThrow('Tenant mismatch');
  });

  it('seller_assistant role is distinguishable from seller_admin for write-gating', () => {
    const assistant = buildJWT({ tenant_id: TENANT_A, role: 'seller_assistant' });
    const admin = buildJWT({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(decodeJWTPayload(assistant).role).toBe('seller_assistant');
    expect(decodeJWTPayload(admin).role).toBe('seller_admin');
    expect(decodeJWTPayload(assistant).role).not.toBe(decodeJWTPayload(admin).role);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3 — app.whatsapp_credit_transactions: tenant isolation
// ────────────────────────────────────────────────────────────────────────────
describe('whatsapp_credit_transactions: cross-tenant claim isolation', () => {
  it('tenant A claim fails assertion against tenant B', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c, TENANT_B)).toThrow(AuthorizationError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4 — app.whatsapp_templates: platform-managed rows (tenant_id
// NULL) are conceptually tenant-agnostic; the app layer must not require a
// tenant match to read them. Verifies assertTenantClaim only enforces a
// match when expectedTenantId is actually supplied (i.e. callers reading
// platform-managed templates should not pass an expectedTenantId at all).
// ────────────────────────────────────────────────────────────────────────────
describe('whatsapp_templates: platform-managed vs tenant-scoped claim behavior', () => {
  it('assertTenantClaim does not throw when no expectedTenantId is given (platform-managed read path)', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c)).not.toThrow();
  });

  it('assertTenantClaim throws for a tenant-scoped template belonging to a different tenant', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c, TENANT_B)).toThrow(AuthorizationError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 5 — app.whatsapp_send_queue / app.tenant_broadcast_limits: tenant
// isolation
// ────────────────────────────────────────────────────────────────────────────
describe('whatsapp_send_queue / tenant_broadcast_limits: cross-tenant claim isolation', () => {
  it('tenant A claim fails assertion against tenant B (tenant_broadcast_limits PK = tenant_id)', () => {
    const c = claims({ tenant_id: TENANT_A, role: 'seller_admin' });
    expect(() => assertTenantClaim(c, TENANT_B)).toThrow(AuthorizationError);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 6 (bonus) — buyers must never be treated as seller claims: buyer
// JWTs carry buyer_id and a buyer_* role, which route/RLS logic uses to
// exclude them from whatsapp_messages / whatsapp_credit_transactions /
// whatsapp_broadcasts entirely.
// ────────────────────────────────────────────────────────────────────────────
describe('buyer claims are structurally distinct from seller claims (seller-only tables)', () => {
  it('buyer_admin JWT carries a non-null buyer_id', () => {
    const token = buildJWT({ tenant_id: TENANT_A, role: 'buyer_admin', buyer_id: BUYER_A });
    const payload = decodeJWTPayload(token);
    expect(payload.buyer_id).toBe(BUYER_A);
    expect(payload.role).toBe('buyer_admin');
  });

  it('seller_admin JWT never carries a buyer_id', () => {
    const token = buildJWT({ tenant_id: TENANT_A, role: 'seller_admin' });
    const payload = decodeJWTPayload(token);
    expect(payload.buyer_id).toBeUndefined();
  });

  it('extractVerifiedClaims surfaces buyer_id for buyer requests (route can use this to deny seller-only tables)', () => {
    const req = makeRequest({
      'x-verified-tenant-id': TENANT_A,
      'x-verified-role': 'buyer_admin',
      'x-verified-buyer-id': BUYER_A,
    });
    const extracted = extractVerifiedClaims(req);
    expect(extracted.buyer_id).toBe(BUYER_A);
    expect(extracted.role).toBe('buyer_admin');
  });

  it('extractVerifiedClaims surfaces no buyer_id for seller requests', () => {
    const req = makeRequest({
      'x-verified-tenant-id': TENANT_A,
      'x-verified-role': 'seller_admin',
      'x-verified-buyer-id': null,
    });
    const extracted = extractVerifiedClaims(req);
    expect(extracted.buyer_id).toBeNull();
    expect(extracted.role).toBe('seller_admin');
  });
});
