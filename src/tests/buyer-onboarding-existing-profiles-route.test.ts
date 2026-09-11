import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const getUserMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => getUserMock() },
    schema: () => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    }),
  }),
}));

const pendingProfile = (overrides: Record<string, unknown> = {}) => ({
  context: {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    role: 'buyer_pending',
    buyer_id: 'buyer-1',
    location_ids: null,
    mode: 'buyer',
    share_token: null,
    preview: null,
  },
  buyer: { id: 'buyer-1', tenant_id: 'tenant-1', business_name: 'Test Buyer' },
  tenant: { id: 'tenant-1', business_name: 'Tenant One', slug: 'tenant-one' },
  greeting_name: 'Test',
  ...overrides,
});

describe('POST /api/buyer/onboarding/existing-profiles', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    getUserMock.mockReset();
    rpcMock.mockReset();
  });

  it('rejects a session that is not buyer_pending/buyer_admin', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(
      pendingProfile({ context: { ...pendingProfile().context, role: 'buyer_assistant' } }),
    );
    const { POST } = await import('../../app/api/buyer/onboarding/existing-profiles/route');
    const response = await POST(new Request('http://localhost/api/buyer/onboarding/existing-profiles', { method: 'POST' }) as any);
    expect(response.status).toBe(401);
  });

  it('returns an empty list when the session has no otp_verified_phone, without calling the rpc', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
    getUserMock.mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null });
    const { POST } = await import('../../app/api/buyer/onboarding/existing-profiles/route');
    const response = await POST(new Request('http://localhost/api/buyer/onboarding/existing-profiles', { method: 'POST' }) as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.profiles).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('derives the phone from the session and excludes the current tenant, never trusting client input', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
    getUserMock.mockResolvedValue({
      data: { user: { user_metadata: { otp_verified_phone: '9990000001' } } },
      error: null,
    });
    const rows = [
      {
        buyer_id: 'buyer-2',
        tenant_id: 'tenant-2',
        tenant_name: 'Other Tenant',
        business_name: 'Acme Traders',
        contact_name: 'Alice',
        phone: '9990000001',
        gstin: '29AAVIC9992H1Z0',
        is_business: true,
      },
    ];
    rpcMock.mockResolvedValue({ data: rows, error: null });

    const { POST } = await import('../../app/api/buyer/onboarding/existing-profiles/route');
    // Body is ignored entirely — attacker-supplied tenant_id/phone must have no effect.
    const response = await POST(
      new Request('http://localhost/api/buyer/onboarding/existing-profiles', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: 'attacker-tenant', phone: '0000000000' }),
      }) as any,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles).toEqual(rows);
    expect(rpcMock).toHaveBeenCalledWith(
      'find_existing_profiles_for_phone',
      expect.objectContaining({ p_phone: '9990000001', p_exclude_tenant_id: 'tenant-1' }),
    );
  });

  it('returns 500 when the rpc errors', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
    getUserMock.mockResolvedValue({
      data: { user: { user_metadata: { otp_verified_phone: '9990000001' } } },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { POST } = await import('../../app/api/buyer/onboarding/existing-profiles/route');
    const response = await POST(new Request('http://localhost/api/buyer/onboarding/existing-profiles', { method: 'POST' }) as any);
    expect(response.status).toBe(500);
  });
});
