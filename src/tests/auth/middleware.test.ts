import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { decodeJWTPayloadMock, getSessionMock } = vi.hoisted(() => ({
  decodeJWTPayloadMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: vi.fn(() => ({
    auth: {
      getSession: getSessionMock,
    },
  })),
}));

vi.mock('@/lib/auth', () => ({
  decodeJWTPayload: decodeJWTPayloadMock,
}));

describe('middleware auth redirects', () => {
  beforeEach(() => {
    decodeJWTPayloadMock.mockReset();
    getSessionMock.mockReset();
  });

  it('redirects seller routes to /login when the session is missing', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?reason=session_expired');
  });

  it('redirects buyer routes to /login/phone when the session is malformed or expired', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'bad-token',
          user: { id: 'buyer-user-1' },
        },
      },
    });
    decodeJWTPayloadMock.mockImplementation(() => {
      throw new Error('Malformed JWT');
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/shop/catalog'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login/phone?reason=session_expired');
  });

  it('forwards verified location ids from the JWT payload', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'good-token',
          user: { id: 'seller-user-1' },
        },
      },
    });
    decodeJWTPayloadMock.mockReturnValue({
      tenant_id: 'tenant-1',
      user_role: 'seller_assistant',
      location_ids: ['loc-1', 'loc-2'],
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/orders'));

    expect(response.headers.get('x-tenant-subdomain')).toBe('');
  });
});
