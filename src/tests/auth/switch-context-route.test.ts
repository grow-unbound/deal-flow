import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllLoginCandidatesMock = vi.fn();
const writeVerifiedCandidatesRecordMock = vi.fn();
const getVerifiedClaimsMock = vi.fn();
const getUserByIdMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  findAllLoginCandidates: (...args: unknown[]) => findAllLoginCandidatesMock(...args),
}));

vi.mock('@/lib/server/buyer-otp-store', () => ({
  writeVerifiedCandidatesRecord: (...args: unknown[]) => writeVerifiedCandidatesRecordMock(...args),
}));

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => getUserByIdMock(...args),
      },
    },
  },
}));

const sellerCandidate = {
  kind: 'seller' as const,
  tenant_id: 'tenant-1',
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  tenant_whatsapp_number: null,
  tenant_whatsapp_display_name: null,
  tenant_logo_url: null,
  role: 'seller_admin',
  buyer_id: null,
  principal_type: 'seller' as const,
  user_id: 'user-1',
  buyer_user_id: null,
  phone: '9990009902',
  business_name: '',
  contact_name: 'Seller One',
  email: 'seller@example.com',
};

const secondSellerCandidate = {
  ...sellerCandidate,
  tenant_id: 'tenant-2',
  tenant_name: 'Tenant Two',
  tenant_slug: 'tenant-two',
  role: 'seller_assistant',
  user_id: 'user-2',
};

const buyerCandidate = {
  kind: 'buyer' as const,
  tenant_id: 'tenant-3',
  tenant_name: 'Tenant Three',
  tenant_slug: 'tenant-three',
  tenant_whatsapp_number: null,
  tenant_whatsapp_display_name: null,
  tenant_logo_url: null,
  role: 'buyer_admin',
  buyer_id: 'buyer-1',
  principal_type: 'buyer' as const,
  user_id: 'buyer-user',
  buyer_user_id: null,
  phone: '9990009902',
  business_name: 'Buyer One',
  contact_name: 'Buyer One',
  buyer_app_enabled: true,
  tenant_app_enabled: true,
};

function buildRequest() {
  return new Request('http://app.localhost/api/auth/switch-context', {
    method: 'POST',
  }) as any;
}

describe('POST /api/auth/switch-context', () => {
  beforeEach(() => {
    findAllLoginCandidatesMock.mockReset();
    writeVerifiedCandidatesRecordMock.mockReset();
    getVerifiedClaimsMock.mockReset();
    getUserByIdMock.mockReset();
  });

  it('allows legacy authenticated seller sessions to open the account picker for seller accounts linked to the same phone', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { phone: '+91 99900 09902' }, app_metadata: {} } },
      error: null,
    });
    findAllLoginCandidatesMock.mockResolvedValue([sellerCandidate, secondSellerCandidate, buyerCandidate]);
    writeVerifiedCandidatesRecordMock.mockResolvedValue('ref-1');

    const { POST } = await import('../../../app/api/auth/switch-context/route');
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(findAllLoginCandidatesMock).toHaveBeenCalledWith('9990009902');
    expect(writeVerifiedCandidatesRecordMock).toHaveBeenCalledWith(
      '9990009902',
      [sellerCandidate, secondSellerCandidate],
      false,
      'user-1',
    );
    expect(response.status).toBe(200);
    expect(body.ref_id).toBe('ref-1');
  });

  it('does not use an unanchored legacy auth phone to expose unrelated seller accounts', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { phone: '9990009902' }, app_metadata: {} } },
      error: null,
    });
    const victimCandidate = { ...secondSellerCandidate, user_id: 'victim-user' };
    findAllLoginCandidatesMock.mockResolvedValue([victimCandidate]);

    const { POST } = await import('../../../app/api/auth/switch-context/route');
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('No other accounts linked to this number.');
    expect(writeVerifiedCandidatesRecordMock).not.toHaveBeenCalled();
  });
});
