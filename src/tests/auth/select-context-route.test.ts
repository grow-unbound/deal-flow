import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 15_000 });

const mintBuyerSessionMock = vi.fn();
const mintSellerSessionMock = vi.fn();
const mintBuyerHandoffLinkMock = vi.fn();
const recordBuyerAppActivitySafeMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  mintBuyerSession: (...args: unknown[]) => mintBuyerSessionMock(...args),
  mintSellerSession: (...args: unknown[]) => mintSellerSessionMock(...args),
  toBuyerLoginCandidate: (c: unknown) => c,
  mintBuyerHandoffLink: (...args: unknown[]) => mintBuyerHandoffLinkMock(...args),
}));

vi.mock('@/lib/server/buyer-app-activity', () => ({
  recordBuyerAppActivitySafe: (...args: unknown[]) => recordBuyerAppActivitySafeMock(...args),
}));

vi.mock('@/lib/server/whatsapp-consent', () => ({
  stampSellerImplicitWhatsappConsent: async () => {},
}));

vi.mock('@/lib/server/phone-consent', () => ({
  requirePhoneConsentRedirect: async () => null,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

const otpMemory = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  let counter = 0;
  return {
    store,
    api: {
      async get(ref: string) {
        return store.get(ref) ?? null;
      },
      async delete(ref: string) {
        store.delete(ref);
      },
    },
    insert(record: Record<string, unknown>): string {
      counter += 1;
      const ref = `ref-${counter}`;
      store.set(ref, record);
      return ref;
    },
  };
});

vi.mock('@/lib/server/buyer-otp-store', () => ({
  buyerOtpStore: otpMemory.api,
  writeVerifiedCandidatesRecord: async (phone: string, candidates: unknown[]) =>
    otpMemory.insert({ kind: 'verified', phone, expiresAt: Date.now() + 60_000, candidates }),
}));

const buyerCandidate = {
  kind: 'buyer' as const,
  tenant_id: 'tenant-1',
  tenant_name: 'Tenant One',
  tenant_slug: 'tenant-one',
  tenant_whatsapp_number: '9876500000',
  tenant_whatsapp_display_name: 'Tenant One',
  buyer_id: 'buyer-1',
  role: 'buyer_admin',
  principal_type: 'buyer',
  user_id: null,
  buyer_user_id: null,
  phone: '9876543210',
  business_name: 'Buyer One',
  contact_name: 'Rajan Mehta',
};

describe('phone-otp select-context route', () => {
  beforeEach(() => {
    mintBuyerSessionMock.mockReset();
    mintSellerSessionMock.mockReset();
    mintBuyerHandoffLinkMock.mockReset();
    recordBuyerAppActivitySafeMock.mockReset();
  });

  async function writeVerifiedRecord(candidates: unknown[]): Promise<string> {
    const { writeVerifiedCandidatesRecord } = await import('@/lib/server/buyer-otp-store');
    const refId = await writeVerifiedCandidatesRecord('9876543210', candidates as any);
    if (!refId) throw new Error('failed to seed verified record for test');
    return refId;
  }

  it('mints a local session when picked on the candidate\'s own tenant host', async () => {
    mintBuyerSessionMock.mockResolvedValue({
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
    });

    const refId = await writeVerifiedRecord([buyerCandidate]);
    const { POST } = await import('../../../app/api/auth/phone-otp/select-context/route');
    const request = Object.assign(new Request('http://localhost/api/auth/phone-otp/select-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-verified-tenant-id': 'tenant-1' },
      body: JSON.stringify({
        ref_id: refId,
        kind: 'buyer',
        tenant_id: 'tenant-1',
        buyer_id: 'buyer-1',
        role: 'buyer_admin',
      }),
    }), {
      nextUrl: new URL('http://localhost/api/auth/phone-otp/select-context'),
    });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.redirect).toBe('/buy/home');
    expect(body.session.access_token).toBe('access-token');
    expect(mintBuyerHandoffLinkMock).not.toHaveBeenCalled();
  });

  it('hands off instead of minting a session when picked off-tenant-host (e.g. catalog.useyukti.in)', async () => {
    mintBuyerHandoffLinkMock.mockResolvedValue({ hashedToken: 'token-xyz', buyerId: 'buyer-1' });

    const refId = await writeVerifiedRecord([buyerCandidate]);
    const { POST } = await import('../../../app/api/auth/phone-otp/select-context/route');
    // No x-verified-tenant-id header — simulates catalog.useyukti.in.
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/select-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_id: refId,
        kind: 'buyer',
        tenant_id: 'tenant-1',
        buyer_id: 'buyer-1',
        role: 'buyer_admin',
      }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.handoff_url).toContain('/auth/storefront-handoff?token_hash=token-xyz');
    expect(body.handoff_url).toContain('tenant-one');
    expect(body.session).toBeUndefined();
    expect(body.redirect).toBeUndefined();
    expect(mintBuyerSessionMock).not.toHaveBeenCalled();
  });

  it('mints a seller session unaffected by the handoff branch (seller kind never handed off)', async () => {
    mintSellerSessionMock.mockResolvedValue({
      session: { access_token: 'seller-token', refresh_token: 'seller-refresh' },
      user: { id: 'seller-user-1' },
    });

    const sellerCandidate = {
      kind: 'seller' as const,
      tenant_id: 'tenant-1',
      tenant_name: 'Tenant One',
      tenant_slug: 'tenant-one',
      tenant_whatsapp_number: null,
      tenant_whatsapp_display_name: null,
      role: 'seller_admin',
      buyer_id: null,
      principal_type: 'seller' as const,
      user_id: 'seller-user-1',
      buyer_user_id: null,
      phone: '9876543210',
      business_name: '',
      contact_name: 'Owner Name',
    };

    const refId = await writeVerifiedRecord([sellerCandidate]);
    const { POST } = await import('../../../app/api/auth/phone-otp/select-context/route');
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/select-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref_id: refId,
        kind: 'seller',
        tenant_id: 'tenant-1',
        buyer_id: null,
        role: 'seller_admin',
      }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirect).toBe('/dashboard');
    expect(body.session.access_token).toBe('seller-token');
    expect(mintBuyerHandoffLinkMock).not.toHaveBeenCalled();
  });
});
