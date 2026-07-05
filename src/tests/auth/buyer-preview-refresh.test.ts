import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const verifyBuyerPreviewTokenMock = vi.fn();
const setBuyerPreviewCookiesMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/buyer-preview', () => ({
  verifyBuyerPreviewToken: (...args: unknown[]) => verifyBuyerPreviewTokenMock(...args),
}));

vi.mock('@/lib/server/buyer-preview-session', () => ({
  setBuyerPreviewCookies: (...args: unknown[]) => setBuyerPreviewCookiesMock(...args),
}));

describe('buyer preview refresh route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    verifyBuyerPreviewTokenMock.mockReset();
    setBuyerPreviewCookiesMock.mockReset();
    setBuyerPreviewCookiesMock.mockResolvedValue(undefined);
  });

  it('extends preview cookies for an active seller session', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });
    verifyBuyerPreviewTokenMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      share_token: 'tok',
      buyer_id: null,
    });

    const { POST } = await import('../../../app/api/buyer/preview/refresh/route');
    const request = new NextRequest('http://localhost/api/buyer/preview/refresh', {
      method: 'POST',
      headers: { cookie: 'buyer_preview=existing-token' },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(setBuyerPreviewCookiesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        shareToken: 'tok',
        buyerId: null,
      }),
    );
  });

  it('returns 401 when preview token is expired', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });
    verifyBuyerPreviewTokenMock.mockResolvedValue(null);

    const { POST } = await import('../../../app/api/buyer/preview/refresh/route');
    const request = new NextRequest('http://localhost/api/buyer/preview/refresh', {
      method: 'POST',
      headers: { cookie: 'buyer_preview=expired-token' },
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 401 for non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-2',
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      buyer_id: 'buyer-1',
    });

    const { POST } = await import('../../../app/api/buyer/preview/refresh/route');
    const request = new NextRequest('http://localhost/api/buyer/preview/refresh', {
      method: 'POST',
      headers: { cookie: 'buyer_preview=existing-token' },
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
