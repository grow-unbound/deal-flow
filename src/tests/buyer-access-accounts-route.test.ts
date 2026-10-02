import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const loadAccessAccountsMock = vi.fn();
vi.mock('@/lib/auth', () => ({ getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args) }));
vi.mock('@/lib/server/buyer-access-accounts', () => ({
  loadAccessAccounts: (...args: unknown[]) => loadAccessAccountsMock(...args),
}));

async function get() {
  const { GET } = await import('../../app/api/buyer/access/accounts/route');
  return GET(new Request('http://localhost/api/buyer/access/accounts') as never);
}

describe('GET /api/buyer/access/accounts', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    loadAccessAccountsMock.mockReset();
  });

  it('401s without a session', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ sub: null, tenant_id: null });
    expect((await get()).status).toBe(401);
  });

  it('403s for anything but a pending buyer session (approved buyers use /siblings)', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ sub: 'u1', tenant_id: 't1', role: 'buyer_admin', buyer_id: 'b1' });
    expect((await get()).status).toBe(403);
    expect(loadAccessAccountsMock).not.toHaveBeenCalled();
  });

  it('returns the accounts, never cached', async () => {
    const claims = { sub: 'u1', tenant_id: 't1', role: 'buyer_pending', buyer_id: 'b1' };
    getVerifiedClaimsMock.mockResolvedValue(claims);
    loadAccessAccountsMock.mockResolvedValue({
      accounts: [{ buyer_id: 'b1', business_name: 'Shop', contact_name: null, state: 'can_request' }],
      source: 'otp_verified',
    });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.current_buyer_id).toBe('b1');
    expect(body.accounts).toHaveLength(1);
    expect(loadAccessAccountsMock).toHaveBeenCalledWith(claims);
  });
});
