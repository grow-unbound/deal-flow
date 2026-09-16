import { beforeEach, describe, expect, it, vi } from 'vitest';

const findBuyerLoginCandidatesMock = vi.fn();
const resolveWinningPriceListForBuyerMock = vi.fn();
const getVerifiedClaimsMock = vi.fn();
const getUserByIdMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  findBuyerLoginCandidates: (...args: unknown[]) => findBuyerLoginCandidatesMock(...args),
}));

vi.mock('@/lib/server/buyer-winning-price-list', () => ({
  resolveWinningPriceListForBuyer: (...args: unknown[]) => resolveWinningPriceListForBuyerMock(...args),
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

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const buyerCandidate = {
  tenant_id: TENANT_ID,
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  tenant_whatsapp_number: null,
  tenant_whatsapp_display_name: null,
  tenant_logo_url: null,
  buyer_id: '22222222-2222-2222-2222-222222222222',
  role: 'buyer_admin' as const,
  principal_type: 'buyer' as const,
  user_id: 'user-1',
  buyer_user_id: null,
  phone: '9990009902',
  business_name: 'Buyer One',
  contact_name: 'Buyer',
  buyer_app_enabled: true,
  tenant_app_enabled: true,
};

describe('GET /api/buyer/siblings', () => {
  beforeEach(() => {
    findBuyerLoginCandidatesMock.mockReset();
    resolveWinningPriceListForBuyerMock.mockReset();
    getVerifiedClaimsMock.mockReset();
    getUserByIdMock.mockReset();
  });

  it('returns siblings for a legacy authenticated buyer session when candidates are linked to the same auth user', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: TENANT_ID,
      role: 'buyer_admin',
      buyer_id: buyerCandidate.buyer_id,
      location_ids: null,
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { phone: '9990009902' }, app_metadata: {} } },
      error: null,
    });
    const secondBuyer = {
      ...buyerCandidate,
      buyer_id: '33333333-3333-3333-3333-333333333333',
      business_name: 'Buyer Two',
      role: 'buyer_assistant' as const,
    };
    const victimBuyer = {
      ...buyerCandidate,
      buyer_id: '44444444-4444-4444-4444-444444444444',
      user_id: 'victim-user',
      business_name: 'Victim Buyer',
    };
    findBuyerLoginCandidatesMock.mockResolvedValue([buyerCandidate, secondBuyer, victimBuyer]);
    resolveWinningPriceListForBuyerMock.mockResolvedValue({
      price_list_id: null,
      price_list_name: null,
    });

    const { GET } = await import('../../../app/api/buyer/siblings/route');
    const response = await GET(new Request('http://tenant.localhost/api/buyer/siblings') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.siblings).toEqual([
      expect.objectContaining({ buyer_id: buyerCandidate.buyer_id, business_name: 'Buyer One' }),
      expect.objectContaining({ buyer_id: secondBuyer.buyer_id, business_name: 'Buyer Two' }),
    ]);
    expect(body.siblings).toHaveLength(2);
    expect(resolveWinningPriceListForBuyerMock).not.toHaveBeenCalledWith(TENANT_ID, victimBuyer.buyer_id);
  });
});
