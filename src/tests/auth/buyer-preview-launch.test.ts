import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const createBuyerPreviewTokenMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/buyer-preview', () => ({
  createBuyerPreviewToken: (...args: unknown[]) => createBuyerPreviewTokenMock(...args),
  buildBuyerPreviewRedirectPath: ({ previewToken, shareToken }: { previewToken: string; shareToken?: string | null }) => (
    `/shop/catalog?buyer_preview=${previewToken}${shareToken ? `&share_token=${shareToken}` : ''}`
  ),
}));

describe('buyer preview launch route', () => {
  beforeEach(() => {
    process.env.BUYER_PREVIEW_TOKEN_SECRET = 'test-preview-secret';
    getVerifiedClaimsMock.mockReset();
    createBuyerPreviewTokenMock.mockReset();
    createBuyerPreviewTokenMock.mockResolvedValue('preview-token');
  });

  it('redirects seller users into buyer catalog preview by default', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/shop/catalog?buyer_preview=preview-token');
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

    expect(createBuyerPreviewTokenMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      shareToken: 'tok',
    });
    expect(response.headers.get('location')).toBe('http://localhost/shop/catalog?buyer_preview=preview-token&share_token=tok');
  });
});
