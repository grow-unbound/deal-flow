import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const createBuyerPreviewTokenMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/buyer-preview', () => ({
  createBuyerPreviewToken: (...args: unknown[]) => createBuyerPreviewTokenMock(...args),
  BUYER_PREVIEW_TTL_SECONDS: 900,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: null,
}));

vi.mock('@/lib/server/buyer-access', () => ({
  findBuyerLoginCandidates: vi.fn().mockResolvedValue([]),
}));

describe('buyer preview launch route', () => {
  beforeEach(() => {
    process.env.BUYER_PREVIEW_TOKEN_SECRET = 'test-preview-secret';
    getVerifiedClaimsMock.mockReset();
    createBuyerPreviewTokenMock.mockReset();
    createBuyerPreviewTokenMock.mockResolvedValue('preview-token');
  });

  it('redirects seller to /buy/catalog when no linked buyer account', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/buy/catalog');
    expect(response.headers.get('set-cookie')).toContain('buyer_preview=preview-token');
  });

  it('deep links catalog launches with the catalog share token', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
    });

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch?share_token=tok'));

    expect(createBuyerPreviewTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', shareToken: 'tok', buyerId: null }),
    );
    expect(response.headers.get('location')).toBe('http://localhost/buy/catalog');
    expect(response.headers.get('set-cookie')).toContain('buyer_preview=preview-token');
  });

  it('returns 401 for non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-2',
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      buyer_id: 'buyer-1',
    });

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch'));

    expect(response.status).toBe(401);
  });
});
