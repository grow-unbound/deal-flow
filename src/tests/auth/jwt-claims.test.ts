import { NextRequest } from 'next/server';
import { vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));
import {
  decodeJWTPayload,
  extractVerifiedClaims,
  assertTenantClaim,
  AuthorizationError,
  getBuyerAppContext,
  getVerifiedClaims,
  type JWTClaims,
} from '@/lib/auth';
import { createBuyerPreviewToken, verifyBuyerPreviewToken, BUYER_PREVIEW_TTL_SECONDS } from '@/lib/buyer-preview';

// A real JWT fixture (header.payload.sig) with known claims
const FIXTURE_PAYLOAD = {
  sub: 'user-123',
  tenant_id: 'tenant-abc',
  role: 'seller_admin',
  buyer_id: null,
  location_ids: ['loc-1', 'loc-2'],
  exp: 9999999999,
};

function buildJWT(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

describe('decodeJWTPayload', () => {
  beforeEach(() => {
    process.env.BUYER_PREVIEW_TOKEN_SECRET = 'test-preview-secret';
  });

  it('decodes a well-formed JWT and returns the payload', () => {
    const token = buildJWT(FIXTURE_PAYLOAD);
    const decoded = decodeJWTPayload(token);
    expect(decoded.tenant_id).toBe('tenant-abc');
    expect(decoded.role).toBe('seller_admin');
    expect(decoded.sub).toBe('user-123');
    expect(decoded.location_ids).toEqual(['loc-1', 'loc-2']);
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
      'x-verified-location-ids': JSON.stringify(['loc-1', 'loc-2']),
    });
    const claims = extractVerifiedClaims(req);
    expect(claims).toEqual<JWTClaims>({
      sub: null,
      tenant_id: 'tenant-abc',
      role: 'seller_admin',
      buyer_id: 'buyer-xyz',
      location_ids: ['loc-1', 'loc-2'],
    });
  });

  it('returns null for missing headers', () => {
    const req = makeRequest({});
    const claims = extractVerifiedClaims(req);
    expect(claims.tenant_id).toBeNull();
    expect(claims.role).toBeNull();
    expect(claims.buyer_id).toBeNull();
    expect(claims.location_ids).toBeNull();
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

describe('buyer preview tokens', () => {
  beforeEach(() => {
    process.env.BUYER_PREVIEW_TOKEN_SECRET = 'test-preview-secret';
  });

  it('creates and verifies a signed preview token', async () => {
    const token = await createBuyerPreviewToken({ tenantId: 'tenant-abc', shareToken: 'cat-123' });
    const payload = await verifyBuyerPreviewToken(token);

    expect(payload?.tenant_id).toBe('tenant-abc');
    expect(payload?.role).toBe('buyer_admin');
    expect(payload?.share_token).toBe('cat-123');
  });

  it('rejects expired preview tokens', async () => {
    const token = await createBuyerPreviewToken({ tenantId: 'tenant-abc', now: 100 });
    await expect(verifyBuyerPreviewToken(token, 100 + BUYER_PREVIEW_TTL_SECONDS + 1)).resolves.toBeNull();
  });

  it('prefers real buyer claims over preview mode', async () => {
    const req = new NextRequest('http://localhost/buy/home');
    req.headers.set('x-verified-tenant-id', 'tenant-abc');
    req.headers.set('x-verified-role', 'buyer_admin');
    req.headers.set('x-verified-buyer-id', 'buyer-123');
    req.headers.set('x-buyer-preview', await createBuyerPreviewToken({ tenantId: 'tenant-abc' }));

    const context = await getBuyerAppContext(req);
    expect(context.mode).toBe('buyer');
    expect(context.buyer_id).toBe('buyer-123');
  });

  it('uses guest mode on a live storefront host without buyer_id', async () => {
    const req = new NextRequest('http://localhost/');
    req.headers.set('x-verified-tenant-id', 'tenant-abc');
    req.headers.set('x-verified-storefront-live', '1');

    const context = await getBuyerAppContext(req);
    expect(context.mode).toBe('guest');
    expect(context.tenant_id).toBe('tenant-abc');
    expect(context.buyer_id).toBeNull();
    expect(context.share_token).toBeNull();
  });

  it('allows seller-authenticated preview mode for matching tenant tokens', async () => {
    const req = new NextRequest('http://localhost/buy/home');
    req.headers.set('x-verified-tenant-id', 'tenant-abc');
    req.headers.set('x-verified-role', 'seller_admin');
    req.headers.set('x-buyer-preview', await createBuyerPreviewToken({ tenantId: 'tenant-abc', shareToken: 'cat-123' }));

    const context = await getBuyerAppContext(req);
    expect(context.mode).toBe('preview');
    expect(context.role).toBe('buyer_admin');
    expect(context.share_token).toBe('cat-123');
    expect(context.buyer_id).toBeNull();
  });
});

describe('getVerifiedClaims fallback', () => {
  it('hydrates location_ids from the workspace RPC when verified headers are absent', async () => {
    const req = new NextRequest('http://localhost/dashboard');
    req.headers.set('authorization', 'Bearer token-123');

    const { supabase, supabaseAdmin } = await import('@/lib/supabase');
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    } as never);
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({
      data: [{
        tenant_id: 'tenant-abc',
        role: 'seller_assistant',
        buyer_id: null,
        location_ids: ['loc-1', 'loc-2'],
      }],
      error: null,
    } as never);

    const claims = await getVerifiedClaims(req);
    expect(claims.tenant_id).toBe('tenant-abc');
    expect(claims.role).toBe('seller_assistant');
    expect(claims.location_ids).toEqual(['loc-1', 'loc-2']);
  });
});
