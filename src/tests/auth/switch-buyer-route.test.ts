import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 15_000 });

const findBuyerLoginCandidatesMock = vi.fn();
const mintBuyerSessionMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  findBuyerLoginCandidates: (...args: unknown[]) => findBuyerLoginCandidatesMock(...args),
  mintBuyerSession: (...args: unknown[]) => mintBuyerSessionMock(...args),
}));

const getVerifiedClaimsMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

const getUserByIdMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => getUserByIdMock(...args),
      },
    },
  },
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ATTACKER_BUYER_ID = '22222222-2222-2222-2222-222222222222';
const ATTACKER_SECOND_BUYER_ID = '33333333-3333-3333-3333-333333333333';
const VICTIM_BUYER_ID = '44444444-4444-4444-4444-444444444444';

const attackerCandidate = {
  tenant_id: TENANT_ID,
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  tenant_whatsapp_number: null,
  tenant_whatsapp_display_name: null,
  tenant_logo_url: null,
  buyer_id: ATTACKER_BUYER_ID,
  role: 'buyer_admin' as const,
  principal_type: 'buyer' as const,
  user_id: 'attacker-user-id',
  buyer_user_id: null,
  phone: '9990009902',
  business_name: 'Attacker Co',
  contact_name: 'Attacker',
  buyer_app_enabled: true,
  tenant_app_enabled: true,
};

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/auth/switch-buyer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('POST /api/auth/switch-buyer', () => {
  beforeEach(() => {
    findBuyerLoginCandidatesMock.mockReset();
    mintBuyerSessionMock.mockReset();
    getVerifiedClaimsMock.mockReset();
    getUserByIdMock.mockReset();
  });

  it('fails closed (400) when the caller session has no otp_verified_phone claim, instead of falling back to a mutable phone column', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'attacker-user-id',
      tenant_id: TENANT_ID,
      role: 'buyer_admin',
      buyer_id: ATTACKER_BUYER_ID,
      location_ids: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { phone: '9990009901' /* poisoned, no otp_verified_phone */ } } },
      error: null,
    });

    const { POST } = await import('../../../app/api/auth/switch-buyer/route');
    const response = await POST(buildRequest({ buyer_id: VICTIM_BUYER_ID }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.session).toBeUndefined();
    expect(findBuyerLoginCandidatesMock).not.toHaveBeenCalled();
    expect(mintBuyerSessionMock).not.toHaveBeenCalled();
  });

  it('blocks the poisoned-phone takeover: an attacker whose mutable phone column now matches a victim delegate cannot mint the victim\'s session', async () => {
    // Simulates the exploit precondition: PATCH /api/buyer/me rewrote the
    // attacker's app.buyers.phone to the victim delegate's app.buyer_users.phone.
    // The attacker's OTP-verified claim (untouched by that PATCH) still points
    // at their own real number, so the candidate lookup never sees the victim.
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'attacker-user-id',
      tenant_id: TENANT_ID,
      role: 'buyer_admin',
      buyer_id: ATTACKER_BUYER_ID,
      location_ids: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { phone: '9990009901', otp_verified_phone: '9990009902' } } },
      error: null,
    });
    // findBuyerLoginCandidates is called with the OTP-verified phone
    // (9990009902) which only maps back to the attacker's own accounts — the
    // victim's buyer_id never appears in the candidate list.
    findBuyerLoginCandidatesMock.mockResolvedValue([attackerCandidate]);

    const { POST } = await import('../../../app/api/auth/switch-buyer/route');
    const response = await POST(buildRequest({ buyer_id: VICTIM_BUYER_ID }));
    const body = await response.json();

    expect(findBuyerLoginCandidatesMock).toHaveBeenCalledWith('9990009902');
    expect(response.status).toBe(403);
    expect(body.session).toBeUndefined();
    expect(mintBuyerSessionMock).not.toHaveBeenCalled();
  });

  it('allows the legitimate flow: a genuine team member switching to their own linked buyer account in the same tenant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'attacker-user-id',
      tenant_id: TENANT_ID,
      role: 'buyer_admin',
      buyer_id: ATTACKER_BUYER_ID,
      location_ids: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { phone: '9990009902', otp_verified_phone: '9990009902' } } },
      error: null,
    });
    // The attacker's OWN real, OTP-verified phone genuinely also links a
    // second buyer account in the same tenant (the legitimate multi-account
    // "Buy As" feature this route exists for).
    const ownSecondAccount = { ...attackerCandidate, buyer_id: ATTACKER_SECOND_BUYER_ID, role: 'buyer_assistant' as const };
    findBuyerLoginCandidatesMock.mockResolvedValue([attackerCandidate, ownSecondAccount]);
    mintBuyerSessionMock.mockResolvedValue({
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
    });

    const { POST } = await import('../../../app/api/auth/switch-buyer/route');
    const response = await POST(buildRequest({ buyer_id: ATTACKER_SECOND_BUYER_ID }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.access_token).toBe('access-token');
    expect(mintBuyerSessionMock).toHaveBeenCalledWith(ownSecondAccount);
  });

  it('rejects a non-buyer session', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'seller-user-id',
      tenant_id: TENANT_ID,
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });

    const { POST } = await import('../../../app/api/auth/switch-buyer/route');
    const response = await POST(buildRequest({ buyer_id: VICTIM_BUYER_ID }));

    expect(response.status).toBe(403);
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });
});
