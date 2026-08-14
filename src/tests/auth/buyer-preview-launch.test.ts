import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const setBuyerPreviewCookiesMock = vi.fn();
const getUserByIdMock = vi.fn();

const supabaseAdminMock = {
  auth: {
    admin: {
      getUserById: getUserByIdMock,
    },
  },
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/buyer-preview', () => ({
  BUYER_PREVIEW_TTL_SECONDS: 900,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: supabaseAdminMock,
}));

vi.mock('@/lib/server/buyer-access', () => ({
  findTenantBuyerPreviewCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/server/buyer-preview-session', () => ({
  setBuyerPreviewCookies: (...args: unknown[]) => setBuyerPreviewCookiesMock(...args),
}));

describe('buyer preview launch route', () => {
  beforeEach(() => {
    process.env.BUYER_PREVIEW_TOKEN_SECRET = 'test-preview-secret';
    getVerifiedClaimsMock.mockReset();
    getUserByIdMock.mockReset();
    setBuyerPreviewCookiesMock.mockReset();
    setBuyerPreviewCookiesMock.mockResolvedValue(undefined);
  });

  it('redirects seller to /buy/home and marks the preview for confirmation when no linked buyer account', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          phone: '+91 98765 43210',
          user_metadata: {},
        },
      },
    });

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/buy/home');
    expect(setBuyerPreviewCookiesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        shareToken: null,
        buyerId: null,
        requiresConfirmation: true,
      }),
    );
  });

  it('deep links catalog launches with the catalog share token', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          phone: '+91 98765 43210',
          user_metadata: {},
        },
      },
    });

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch?share_token=tok'));

    expect(response.headers.get('location')).toBe('http://localhost/buy/home');
    expect(setBuyerPreviewCookiesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        shareToken: 'tok',
        buyerId: null,
        requiresConfirmation: true,
      }),
    );
  });

  it('skips the confirmation gate when the seller resolves to a linked buyer', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          phone: '+91 98765 43210',
          user_metadata: {},
        },
      },
    });

    const { findTenantBuyerPreviewCandidates } = await import('@/lib/server/buyer-access');
    vi.mocked(findTenantBuyerPreviewCandidates).mockResolvedValueOnce([
      {
        buyer_id: 'buyer-1',
        tenant_id: 'tenant-1',
        tenant_name: 'Acme Corp',
        tenant_slug: 'acme',
        tenant_whatsapp_number: '9876500000',
        tenant_whatsapp_display_name: 'Acme Corp',
        role: 'buyer_admin',
        principal_type: 'buyer',
        user_id: null,
        buyer_user_id: null,
        phone: '9876543210',
        business_name: 'Rajan',
        contact_name: 'Rajan',
        buyer_app_enabled: true,
        tenant_app_enabled: true,
      },
    ]);

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/buy/home');
    expect(setBuyerPreviewCookiesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        shareToken: null,
        buyerId: 'buyer-1',
        requiresConfirmation: false,
      }),
    );
  });

  it('redirects to buyer picker when multiple buyers share the seller phone', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
    });

    const { findTenantBuyerPreviewCandidates } = await import('@/lib/server/buyer-access');
    vi.mocked(findTenantBuyerPreviewCandidates).mockResolvedValueOnce([
      {
        buyer_id: 'buyer-1',
        tenant_id: 'tenant-1',
        tenant_name: 'Acme Corp',
        tenant_slug: 'acme',
        tenant_whatsapp_number: null,
        tenant_whatsapp_display_name: null,
        role: 'buyer_admin',
        principal_type: 'buyer',
        user_id: null,
        buyer_user_id: null,
        phone: '9876543210',
        business_name: 'Buyer One',
        contact_name: 'Buyer One',
        buyer_app_enabled: true,
        tenant_app_enabled: true,
      },
      {
        buyer_id: 'buyer-2',
        tenant_id: 'tenant-1',
        tenant_name: 'Acme Corp',
        tenant_slug: 'acme',
        tenant_whatsapp_number: null,
        tenant_whatsapp_display_name: null,
        role: 'buyer_admin',
        principal_type: 'buyer',
        user_id: null,
        buyer_user_id: null,
        phone: '9876543210',
        business_name: 'Buyer Two',
        contact_name: 'Buyer Two',
        buyer_app_enabled: false,
        tenant_app_enabled: true,
      },
    ]);

    const { GET } = await import('../../../app/api/buyer/preview/launch/route');
    const response = await GET(new NextRequest('http://localhost/api/buyer/preview/launch'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/buy/preview/select-buyer');
    expect(setBuyerPreviewCookiesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        buyerId: null,
        requiresConfirmation: false,
      }),
    );
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
