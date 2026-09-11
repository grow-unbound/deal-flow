import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 15_000 });

const mintBuyerSessionMock = vi.fn();
const mintSellerSessionMock = vi.fn();
const mintBuyerHandoffLinkMock = vi.fn();
const recordBuyerAppActivitySafeMock = vi.fn();
const resolvePendingBuyerRedirectMock = vi.fn().mockResolvedValue('/pending');

vi.mock('@/lib/server/buyer-access', () => ({
  mintBuyerSession: (...args: unknown[]) => mintBuyerSessionMock(...args),
  mintSellerSession: (...args: unknown[]) => mintSellerSessionMock(...args),
  toBuyerLoginCandidate: (c: unknown) => c,
  mintBuyerHandoffLink: (...args: unknown[]) => mintBuyerHandoffLinkMock(...args),
  resolvePendingBuyerRedirect: (...args: unknown[]) => resolvePendingBuyerRedirectMock(...args),
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

const getVerifiedClaimsMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
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
  writeVerifiedCandidatesRecord: async (
    phone: string,
    candidates: unknown[],
    otpVerified?: boolean,
    createdByUserId: string | null = null,
  ) =>
    otpMemory.insert({
      kind: 'verified',
      phone,
      expiresAt: Date.now() + 60_000,
      candidates,
      otpVerified: otpVerified ?? false,
      createdByUserId,
    }),
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
  buyer_app_enabled: true,
};

describe('phone-otp select-context route', () => {
  beforeEach(() => {
    mintBuyerSessionMock.mockReset();
    mintSellerSessionMock.mockReset();
    mintBuyerHandoffLinkMock.mockReset();
    recordBuyerAppActivitySafeMock.mockReset();
    getVerifiedClaimsMock.mockReset();
    getVerifiedClaimsMock.mockResolvedValue({ sub: null, tenant_id: null, role: null, buyer_id: null, location_ids: null });
  });

  async function writeVerifiedRecord(candidates: unknown[], createdByUserId: string | null = null): Promise<string> {
    const { writeVerifiedCandidatesRecord } = await import('@/lib/server/buyer-otp-store');
    const refId = await writeVerifiedCandidatesRecord('9876543210', candidates as any, false, createdByUserId);
    if (!refId) throw new Error('failed to seed verified record for test');
    return refId;
  }

  it('reloads verified contexts by ref_id for cross-origin account switching', async () => {
    const refId = await writeVerifiedRecord([buyerCandidate]);
    const { GET } = await import('../../../app/api/auth/phone-otp/contexts/route');
    const request = Object.assign(new Request(`https://catalog.useyukti.in/api/auth/phone-otp/contexts?ref_id=${refId}`, {
      headers: { host: 'catalog.useyukti.in' },
    }), {
      nextUrl: new URL(`https://catalog.useyukti.in/api/auth/phone-otp/contexts?ref_id=${refId}`),
    });

    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.contexts).toEqual([buyerCandidate]);
  });

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
    // No x-verified-tenant-id header, catalog host — this is the workspace
    // picker flow after OTP verification on catalog.useyukti.in.
    const request = Object.assign(new Request('https://catalog.useyukti.in/api/auth/phone-otp/select-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', host: 'catalog.useyukti.in' },
      body: JSON.stringify({
        ref_id: refId,
        kind: 'buyer',
        tenant_id: 'tenant-1',
        buyer_id: 'buyer-1',
        role: 'buyer_admin',
      }),
    }), {
      nextUrl: new URL('https://catalog.useyukti.in/api/auth/phone-otp/select-context'),
    });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.handoff_url).toContain('/auth/storefront-handoff?token_hash=token-xyz');
    expect(body.handoff_url).toContain('tenant-one');
    expect(body.session).toBeUndefined();
    expect(body.redirect).toBeUndefined();
    expect(mintBuyerSessionMock).not.toHaveBeenCalled();
    expect(recordBuyerAppActivitySafeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        eventName: 'session_started',
      }),
    );
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

  it('rejects redeeming a switch-context-created record when the caller session does not match its creator (account-takeover regression guard)', async () => {
    // Simulates the exact exploit chain: an attacker's switch-context call
    // wrote a record stamped with the ATTACKER's user id, but its
    // `candidates` array (from a phone-derived lookup) contains a VICTIM
    // candidate. A caller whose own session doesn't match the stamped
    // creator (attacker-user-id) must never be able to redeem it — even if
    // they otherwise supply a valid ref_id/kind/tenant_id/role/buyer_id.
    const refId = await writeVerifiedRecord([buyerCandidate], 'attacker-user-id');
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'someone-else-or-no-session',
      tenant_id: null,
      role: null,
      buyer_id: null,
      location_ids: null,
    });

    const { POST } = await import('../../../app/api/auth/phone-otp/select-context/route');
    const response = await POST(new Request('http://localhost/api/auth/phone-otp/select-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-verified-tenant-id': 'tenant-1' },
      body: JSON.stringify({
        ref_id: refId,
        kind: 'buyer',
        tenant_id: 'tenant-1',
        buyer_id: 'buyer-1',
        role: 'buyer_admin',
      }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBeUndefined();
    expect(body.session).toBeUndefined();
    expect(mintBuyerSessionMock).not.toHaveBeenCalled();
    expect(mintBuyerHandoffLinkMock).not.toHaveBeenCalled();
  });

  it('allows redeeming a switch-context-created record when the caller session matches its stamped creator (legitimate switch-context flow)', async () => {
    mintBuyerSessionMock.mockResolvedValue({
      session: { access_token: 'access-token', refresh_token: 'refresh-token' },
    });

    const refId = await writeVerifiedRecord([buyerCandidate], 'legit-user-id');
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'legit-user-id',
      tenant_id: null,
      role: null,
      buyer_id: null,
      location_ids: null,
    });

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
    expect(body.session.access_token).toBe('access-token');
  });
});
