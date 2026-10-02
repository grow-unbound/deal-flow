import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const rpcMock = vi.fn();
const notifyMock = vi.fn();
const loadAccessAccountsMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));
vi.mock('@/lib/server/buyer-approval-notify', () => ({
  queueAccessRequestReceivedMessages: (...args: unknown[]) => notifyMock(...args),
}));
vi.mock('@/lib/server/buyer-access-accounts', () => ({
  loadAccessAccounts: (...args: unknown[]) => loadAccessAccountsMock(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }) },
}));

const profile = (buyer: Record<string, unknown> = {}) => ({
  context: { tenant_id: 'tenant-1', role: 'buyer_pending', buyer_id: 'buyer-1' },
  buyer: { id: 'buyer-1', buyer_app_enabled: false, ...buyer },
});

async function post(body?: unknown) {
  const { POST } = await import('../../app/api/buyer/access/request/route');
  return POST(new Request('http://localhost/api/buyer/access/request', {
    method: 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }) as never);
}

describe('POST /api/buyer/access/request', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    rpcMock.mockReset();
    notifyMock.mockReset();
    loadAccessAccountsMock.mockReset();
    notifyMock.mockResolvedValue({ buyerSent: true, sellerSent: true });
  });

  it('401s without a buyer session', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('is a no-op for a buyer whose access was already enabled', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(profile({ buyer_app_enabled: true }));
    const body = await (await post()).json();
    expect(body).toEqual({ success: true, already_approved: true });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('raises the entry and notifies seller + buyer on the first request', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(profile());
    rpcMock.mockResolvedValue({ data: { entry_id: 'entry-1', already_requested: false }, error: null });
    const response = await post();
    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('request_buyer_app_access', { p_buyer_id: 'buyer-1' });
    expect(notifyMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'buyer-1');
  });

  it('does not re-notify when a request is already open', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(profile());
    rpcMock.mockResolvedValue({ data: { entry_id: 'entry-1', already_requested: true }, error: null });
    const body = await (await post()).json();
    expect(body).toEqual({ success: true, already_requested: true });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('409s a self-registered buyer (they use the intake form)', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(profile());
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_an_existing_buyer' } });
    expect((await post()).status).toBe(409);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('still succeeds when the WhatsApp notification throws', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(profile());
    rpcMock.mockResolvedValue({ data: { entry_id: 'entry-1', already_requested: false }, error: null });
    notifyMock.mockRejectedValue(new Error('whatsapp down'));
    expect((await post()).status).toBe(200);
  });

  it('500s on an unexpected rpc failure', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(profile());
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect((await post()).status).toBe(500);
  });

  describe('choosing one of several accounts', () => {
    const SIBLING = '8f1d0000-0000-4000-8000-000000000002';
    const accountsWith = (state: string) => ({
      accounts: [
        { buyer_id: 'buyer-1', business_name: 'Own', contact_name: null, state: 'can_request' },
        { buyer_id: SIBLING, business_name: 'Sibling', contact_name: null, state },
      ],
      source: 'otp_verified',
    });

    it('requests access for the chosen sibling and notifies about that buyer', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(profile());
      loadAccessAccountsMock.mockResolvedValue(accountsWith('can_request'));
      rpcMock.mockResolvedValue({ data: { entry_id: 'entry-2', already_requested: false }, error: null });

      const response = await post({ buyer_id: SIBLING });

      expect(response.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith('request_buyer_app_access', { p_buyer_id: SIBLING });
      expect(notifyMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', SIBLING);
    });

    it('403s an account the caller does not own', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(profile());
      loadAccessAccountsMock.mockResolvedValue(accountsWith('can_request'));

      const response = await post({ buyer_id: '8f1d0000-0000-4000-8000-0000000000ff' });

      expect(response.status).toBe(403);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it.each(['active', 'requested', 'declined', 'needs_more_info'])('403s a sibling already in state %s', async (state) => {
      requireBuyerAccessProfileMock.mockResolvedValue(profile());
      loadAccessAccountsMock.mockResolvedValue(accountsWith(state));

      expect((await post({ buyer_id: SIBLING })).status).toBe(403);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('400s a malformed buyer_id', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(profile());
      expect((await post({ buyer_id: 'not-a-uuid' })).status).toBe(400);
    });

    it("needs no account lookup when the chosen account is the session's own buyer", async () => {
      const OWN = '8f1d0000-0000-4000-8000-000000000001';
      requireBuyerAccessProfileMock.mockResolvedValue(profile({ id: OWN }));
      rpcMock.mockResolvedValue({ data: { entry_id: 'entry-1', already_requested: false }, error: null });

      const response = await post({ buyer_id: OWN });

      expect(response.status).toBe(200);
      expect(loadAccessAccountsMock).not.toHaveBeenCalled();
      expect(rpcMock).toHaveBeenCalledWith('request_buyer_app_access', { p_buyer_id: OWN });
    });
  });
});
