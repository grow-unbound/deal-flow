import { NextRequest } from 'next/server';
import {
  decodeJWTPayload,
  extractVerifiedClaims,
  assertTenantClaim,
  AuthorizationError,
  type JWTClaims,
} from '@/lib/auth';

// A real JWT fixture (header.payload.sig) with known claims
const FIXTURE_PAYLOAD = {
  sub: 'user-123',
  tenant_id: 'tenant-abc',
  role: 'seller_admin',
  buyer_id: null,
  exp: 9999999999,
};

function buildJWT(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

describe('decodeJWTPayload', () => {
  it('decodes a well-formed JWT and returns the payload', () => {
    const token = buildJWT(FIXTURE_PAYLOAD);
    const decoded = decodeJWTPayload(token);
    expect(decoded.tenant_id).toBe('tenant-abc');
    expect(decoded.role).toBe('seller_admin');
    expect(decoded.sub).toBe('user-123');
  });

  it('throws on a malformed JWT with no payload segment', () => {
    expect(() => decodeJWTPayload('not-a-jwt')).toThrow('Malformed JWT');
  });
});

describe('extractVerifiedClaims', () => {
  function makeRequest(headers: Record<string, string>): NextRequest {
    const req = new NextRequest('http://localhost/dashboard');
    Object.entries(headers).forEach(([k, v]) => {
      (req.headers as Headers).set(k, v);
    });
    return req;
  }

  it('extracts all three claims from verified headers', () => {
    const req = makeRequest({
      'x-verified-tenant-id': 'tenant-abc',
      'x-verified-role': 'seller_admin',
      'x-verified-buyer-id': 'buyer-xyz',
    });
    const claims = extractVerifiedClaims(req);
    expect(claims).toEqual<JWTClaims>({
      tenant_id: 'tenant-abc',
      role: 'seller_admin',
      buyer_id: 'buyer-xyz',
    });
  });

  it('returns null for missing headers', () => {
    const req = makeRequest({});
    const claims = extractVerifiedClaims(req);
    expect(claims.tenant_id).toBeNull();
    expect(claims.role).toBeNull();
    expect(claims.buyer_id).toBeNull();
  });
});

describe('assertTenantClaim', () => {
  it('passes when tenant_id is present and no expected value given', () => {
    expect(() =>
      assertTenantClaim({ tenant_id: 'tenant-abc', role: 'seller_admin', buyer_id: null })
    ).not.toThrow();
  });

  it('passes when tenant_id matches expectedTenantId', () => {
    expect(() =>
      assertTenantClaim({ tenant_id: 'tenant-abc', role: 'seller_admin', buyer_id: null }, 'tenant-abc')
    ).not.toThrow();
  });

  it('throws AuthorizationError when tenant_id is null', () => {
    expect(() =>
      assertTenantClaim({ tenant_id: null, role: 'seller_admin', buyer_id: null })
    ).toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when tenant_id does not match expected', () => {
    expect(() =>
      assertTenantClaim({ tenant_id: 'tenant-abc', role: 'seller_admin', buyer_id: null }, 'tenant-other')
    ).toThrow(AuthorizationError);
  });
});
