import { beforeEach, describe, expect, it, vi } from 'vitest';

// Dynamic imports after vi.resetModules() are slow on cold start — allow 15s per test.
vi.setConfig({ testTimeout: 15_000 });

const findAllLoginCandidatesMock = vi.fn();
const findBuyerLoginCandidatesMock = vi.fn();
const sendLoginOtpWhatsappMock = vi.fn();
const mintBuyerSessionMock = vi.fn();
const mintSellerSessionMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  findAllLoginCandidates: (...args: unknown[]) => findAllLoginCandidatesMock(...args),
  findBuyerLoginCandidates: (...args: unknown[]) => findBuyerLoginCandidatesMock(...args),
  mintBuyerSession: (...args: unknown[]) => mintBuyerSessionMock(...args),
  mintSellerSession: (...args: unknown[]) => mintSellerSessionMock(...args),
  toBuyerLoginCandidate: (c: unknown) => c, // identity — already in BuyerLoginCandidate shape for tests
}));

vi.mock('@/lib/server/whatsapp', () => ({
  sendLoginOtpWhatsapp: (...args: unknown[]) => sendLoginOtpWhatsappMock(...args),
}));

const eligibleBuyerCandidate = {
  kind: 'buyer' as const,
  tenant_id: 'tenant-1',
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  buyer_id: 'buyer-1',
  role: 'buyer_admin',
  principal_type: 'buyer',
  user_id: null,
  buyer_user_id: null,
  phone: '9876543210',
  business_name: 'Buyer One',
  contact_name: 'Rajan Mehta',
  buyer_app_enabled: true,
  tenant_app_enabled: true,
};

describe('buyer phone otp routes', () => {
  beforeEach(() => {
    vi.resetModules();
    findAllLoginCandidatesMock.mockReset();
    findBuyerLoginCandidatesMock.mockReset();
    sendLoginOtpWhatsappMock.mockReset();
    mintBuyerSessionMock.mockReset();
    mintSellerSessionMock.mockReset();
  });

  it('sends OTP only for registered enabled buyer principals', async () => {
    findAllLoginCandidatesMock.mockResolvedValue([eligibleBuyerCandidate]);

    const { POST } = await import('../../../app/api/auth/phone-otp/send/route');
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/send', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '9876543210' }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.registered).toBe(true);
    expect(typeof body.ref_id).toBe('string');
    expect(sendLoginOtpWhatsappMock).toHaveBeenCalledTimes(1);
  });

  it('returns unregistered for unknown numbers', async () => {
    findAllLoginCandidatesMock.mockResolvedValue([]);
    findBuyerLoginCandidatesMock.mockResolvedValue([]);

    const { POST } = await import('../../../app/api/auth/phone-otp/send/route');
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/send', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '9876543210' }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.registered).toBe(false);
    expect(body.ref_id).toBeNull();
  });

  it('returns tenant blocked message when tenant disabled buyer app', async () => {
    // findAllLoginCandidates filters out ineligible — returns empty
    findAllLoginCandidatesMock.mockResolvedValue([]);
    // findBuyerLoginCandidates returns the blocked candidate for messaging
    findBuyerLoginCandidatesMock.mockResolvedValue([
      {
        ...eligibleBuyerCandidate,
        tenant_name: 'Acme Corp',
        tenant_slug: 'acme',
        buyer_app_enabled: true,
        tenant_app_enabled: false,
      },
    ]);

    const { POST } = await import('../../../app/api/auth/phone-otp/send/route');
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/send', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '9876543210' }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.registered).toBe(false);
    expect(body.ref_id).toBeNull();
    expect(body.message).toContain('Acme Corp');
    expect(body.message).toContain('does not allow');
  });

  it('returns buyer blocked message when buyer app not enabled by tenant', async () => {
    findAllLoginCandidatesMock.mockResolvedValue([]);
    findBuyerLoginCandidatesMock.mockResolvedValue([
      {
        ...eligibleBuyerCandidate,
        tenant_name: 'Acme Corp',
        tenant_slug: 'acme',
        buyer_app_enabled: false,
        tenant_app_enabled: true,
      },
    ]);

    const { POST } = await import('../../../app/api/auth/phone-otp/send/route');
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/send', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '9876543210' }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.registered).toBe(false);
    expect(body.ref_id).toBeNull();
    expect(body.message).toContain('Acme Corp');
    expect(body.message).toContain('enable');
  });

  it('verifies OTP and mints a session for a single buyer context', async () => {
    findAllLoginCandidatesMock.mockResolvedValue([eligibleBuyerCandidate]);
    mintBuyerSessionMock.mockResolvedValue({
      session: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      },
    });

    const sendRoute = await import('../../../app/api/auth/phone-otp/send/route');
    const sendResponse = await sendRoute.POST(new Request('http://localhost/api/auth/phone-otp/send', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '9876543210' }),
    }) as any);
    const sendBody = await sendResponse.json();

    const verifyRoute = await import('../../../app/api/auth/phone-otp/verify/route');
    const storeModule = await import('@/lib/server/buyer-otp-store');
    const pending = storeModule.buyerOtpStore.get(sendBody.ref_id);
    const response = await verifyRoute.POST(new Request('http://localhost/api/auth/phone-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ ref_id: sendBody.ref_id, otp: pending && pending.kind === 'pending' ? pending.otp : '000000' }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.redirect).toBe('/buy/home');
    expect(body.session.access_token).toBe('access-token');
    expect(mintBuyerSessionMock).toHaveBeenCalledTimes(1);
  });
});
