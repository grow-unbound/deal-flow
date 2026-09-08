import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const findBuyerWorkspaceCandidatesForUserMock = vi.fn();
const findBuyerLoginCandidatesMock = vi.fn();
const mintBuyerHandoffLinkMock = vi.fn();
const recordBuyerAppActivitySafeMock = vi.fn();
const resolveCallerPhoneMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/buyer-access', () => ({
  findBuyerWorkspaceCandidatesForUser: (...args: unknown[]) => findBuyerWorkspaceCandidatesForUserMock(...args),
  findBuyerLoginCandidates: (...args: unknown[]) => findBuyerLoginCandidatesMock(...args),
  mintBuyerHandoffLink: (...args: unknown[]) => mintBuyerHandoffLinkMock(...args),
}));

vi.mock('@/lib/server/buyer-app-activity', () => ({
  recordBuyerAppActivitySafe: (...args: unknown[]) => recordBuyerAppActivitySafeMock(...args),
}));

vi.mock('@/lib/server/resolve-auth-phone', () => ({
  resolveCallerPhone: (...args: unknown[]) => resolveCallerPhoneMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

const buyerCandidate = {
  tenant_id: '11111111-1111-1111-1111-111111111111',
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  tenant_whatsapp_number: null,
  tenant_whatsapp_display_name: null,
  tenant_logo_url: 'logos/tenant-one.png',
  buyer_id: '22222222-2222-2222-2222-222222222222',
  role: 'buyer_admin',
  principal_type: 'buyer',
  user_id: 'user-1',
  buyer_user_id: null,
  phone: '9876543210',
  business_name: 'Buyer One',
  contact_name: 'Rajan',
  buyer_app_enabled: true,
  tenant_app_enabled: true,
};

describe('catalog workspace auth routes', () => {
  beforeEach(() => {
    vi.resetModules();
    getVerifiedClaimsMock.mockReset();
    findBuyerWorkspaceCandidatesForUserMock.mockReset();
    findBuyerLoginCandidatesMock.mockReset();
    mintBuyerHandoffLinkMock.mockReset();
    recordBuyerAppActivitySafeMock.mockReset();
    resolveCallerPhoneMock.mockReset();
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      role: 'buyer_admin',
      buyer_id: '22222222-2222-2222-2222-222222222222',
      location_ids: null,
    });
    findBuyerWorkspaceCandidatesForUserMock.mockResolvedValue([buyerCandidate]);
    mintBuyerHandoffLinkMock.mockResolvedValue({ hashedToken: 'token-abc', buyerId: buyerCandidate.buyer_id });
  });

  it('loads workspaces through the user-scoped workspace candidate RPC path', async () => {
    const { GET } = await import('../../../app/api/auth/workspaces/route');
    const response = await GET(new Request('https://catalog.useyukti.in/api/auth/workspaces', {
      headers: { host: 'catalog.useyukti.in' },
    }) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tenants).toHaveLength(1);
    expect(body.tenants[0].logo_url).toBe('logos/tenant-one.png');
    expect(findBuyerWorkspaceCandidatesForUserMock).toHaveBeenCalledWith('user-1');
    expect(resolveCallerPhoneMock).not.toHaveBeenCalled();
    expect(findBuyerLoginCandidatesMock).not.toHaveBeenCalled();
  });

  it('enters a workspace without re-resolving phone or expanding phone candidates', async () => {
    const { POST } = await import('../../../app/api/auth/workspaces/enter/route');
    const request = Object.assign(new Request('https://catalog.useyukti.in/api/auth/workspaces/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', host: 'catalog.useyukti.in' },
      body: JSON.stringify({
        tenant_id: buyerCandidate.tenant_id,
        buyer_id: buyerCandidate.buyer_id,
        role: buyerCandidate.role,
      }),
    }), {
      nextUrl: new URL('https://catalog.useyukti.in/api/auth/workspaces/enter'),
    });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.handoff_url).toContain('https://tenant-one.useyukti.in/auth/storefront-handoff');
    expect(body.handoff_url).toContain('token_hash=token-abc');
    expect(findBuyerWorkspaceCandidatesForUserMock).toHaveBeenCalledWith('user-1');
    expect(resolveCallerPhoneMock).not.toHaveBeenCalled();
    expect(findBuyerLoginCandidatesMock).not.toHaveBeenCalled();
  });
});
