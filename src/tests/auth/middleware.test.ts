import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getClaimsMock } = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getClaims: getClaimsMock,
    },
  })),
}));

describe('middleware auth redirects', () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
  });

  it('allows anonymous access to /activate without redirecting to /login', async () => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/activate'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects to /login when the session is missing', async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: { message: 'Auth session missing' },
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fdashboard');
  });

  it('redirects to /login when the JWT fails signature verification', async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid signature' },
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/buy/catalog'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fbuy%2Fcatalog');
  });

  it('forwards verified location ids from the verified claims', async () => {
    getClaimsMock.mockResolvedValue({
      data: {
        claims: {
          sub: 'seller-user-1',
          tenant_id: 'tenant-1',
          user_role: 'seller_assistant',
          location_ids: ['loc-1', 'loc-2'],
        },
      },
      error: null,
    });

    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest('http://localhost/orders'));

    expect(response.headers.get('x-tenant-subdomain')).toBe('');
  });
});
