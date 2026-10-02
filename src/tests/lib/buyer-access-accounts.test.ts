import { beforeEach, describe, expect, it, vi } from 'vitest';

const findBuyerLoginCandidatesMock = vi.fn();
vi.mock('@/lib/server/buyer-access', () => ({
  findBuyerLoginCandidates: (...args: unknown[]) => findBuyerLoginCandidatesMock(...args),
}));

const getUserByIdMock = vi.fn();
let buyerRows: Array<Record<string, unknown>> = [];
let openEntryRows: Array<{ source_entity_id: string }> = [];
const buyerFilters: Record<string, unknown> = {};

function chain(result: () => unknown, capture?: Record<string, unknown>, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'is', 'in', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      if (capture && method === 'eq') capture[String(args[0])] = args[1];
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: error ? null : result(), error });
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: (...args: unknown[]) => getUserByIdMock(...args) } },
    schema: () => ({
      from: (table: string) => (table === 'buyers' ? chain(() => buyerRows, buyerFilters) : chain(() => openEntryRows)),
    }),
  },
}));

const TENANT = 'tenant-1';
const candidate = (buyerId: string, over: Record<string, unknown> = {}) => ({
  tenant_id: TENANT, buyer_id: buyerId, role: 'buyer_admin', user_id: 'u1', buyer_app_enabled: false, ...over,
});
const buyer = (id: string, over: Record<string, unknown> = {}) => ({
  id, business_name: `Shop ${id}`, contact_name: null, buyer_app_enabled: false,
  onboarding_status: 'approved', custom_fields: {}, ...over,
});

describe('classifyAccessAccount', () => {
  it.each([
    ['enabled buyer', { buyer_app_enabled: true, onboarding_status: 'approved', custom_fields: {} }, false, 'active'],
    ['enabled flag null counts as enabled', { buyer_app_enabled: null, onboarding_status: null, custom_fields: null }, false, 'active'],
    ['declined', { buyer_app_enabled: false, onboarding_status: 'declined', custom_fields: {} }, false, 'declined'],
    ['seller asked for more info', { buyer_app_enabled: false, onboarding_status: 'needs_more_info', custom_fields: {} }, true, 'needs_more_info'],
    ['self-registered, no intake yet', { buyer_app_enabled: false, onboarding_status: 'pending_approval', custom_fields: { storefront_self_registered: true } }, false, 'needs_intake'],
    ['existing buyer with an open request', { buyer_app_enabled: false, onboarding_status: 'approved', custom_fields: { access_requested_at: 'x' } }, true, 'requested'],
    ['self-registered, intake filed', { buyer_app_enabled: false, onboarding_status: 'pending_approval', custom_fields: { storefront_self_registered: true, intake_submitted_at: 'x' } }, false, 'awaiting_approval'],
    ['existing buyer, never asked', { buyer_app_enabled: false, onboarding_status: 'approved', custom_fields: {} }, false, 'can_request'],
    ['approved before, disabled again, old request resolved', { buyer_app_enabled: false, onboarding_status: 'approved', custom_fields: { access_requested_at: 'x' } }, false, 'can_request'],
  ])('%s -> %s', async (_name, row, hasOpen, expected) => {
    const { classifyAccessAccount } = await import('@/lib/server/buyer-access-accounts');
    expect(classifyAccessAccount(row as never, hasOpen as boolean)).toBe(expected);
  });
});

describe('loadAccessAccounts', () => {
  beforeEach(() => {
    findBuyerLoginCandidatesMock.mockReset();
    getUserByIdMock.mockReset();
    buyerRows = [];
    openEntryRows = [];
    for (const key of Object.keys(buyerFilters)) delete buyerFilters[key];
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { otp_verified_phone: '9876543210' } } }, error: null });
  });

  const claims = { sub: 'u1', tenant_id: TENANT, buyer_id: 'b1' };

  it('lists every account for the phone at the session tenant, once per buyer, usable ones first', async () => {
    findBuyerLoginCandidatesMock.mockResolvedValue([
      candidate('b1'), candidate('b1', { role: 'buyer_assistant' }), // owner + delegate row of the same buyer
      candidate('b2', { buyer_app_enabled: true }),
      candidate('b3'),
      candidate('other', { tenant_id: 'tenant-2' }), // different tenant: never shown
    ]);
    buyerRows = [
      buyer('b1'),
      buyer('b2', { buyer_app_enabled: true, business_name: 'Active Shop' }),
      buyer('b3', { custom_fields: { access_requested_at: 'x' } }),
    ];
    openEntryRows = [{ source_entity_id: 'b3' }];

    const { loadAccessAccounts } = await import('@/lib/server/buyer-access-accounts');
    const { accounts, source } = await loadAccessAccounts(claims);

    expect(source).toBe('otp_verified');
    expect(accounts.map((a) => [a.buyer_id, a.state])).toEqual([
      ['b2', 'active'],
      ['b1', 'can_request'],
      ['b3', 'requested'],
    ]);
    expect(buyerFilters.tenant_id).toBe(TENANT);
  });

  it('falls back to the session buyer alone when no verified phone is available', async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null });
    buyerRows = [buyer('b1')];

    const { loadAccessAccounts } = await import('@/lib/server/buyer-access-accounts');
    const { accounts, source } = await loadAccessAccounts(claims);

    expect(source).toBe('session_only');
    expect(findBuyerLoginCandidatesMock).not.toHaveBeenCalled();
    expect(accounts.map((a) => a.buyer_id)).toEqual(['b1']);
  });

  it('returns nothing for a session with no tenant or user', async () => {
    const { loadAccessAccounts } = await import('@/lib/server/buyer-access-accounts');
    await expect(loadAccessAccounts({ sub: null, tenant_id: null, buyer_id: null })).resolves.toEqual({ accounts: [], source: 'session_only' });
  });
});

describe('lookup failures', () => {
  it('throw instead of reporting "nothing open", so a requested account is never shown as requestable', async () => {
    const { hasOpenExistingBuyerAccessRequest } = await import('@/lib/server/buyer-access-accounts');
    const failing = { schema: () => ({ from: () => chain(() => null, undefined, { message: 'db down' }) }) };
    await expect(hasOpenExistingBuyerAccessRequest(failing, TENANT, 'b1')).rejects.toThrow(/lookup failed/);
  });
});

describe('hasOpenExistingBuyerAccessRequest', () => {
  it('is true only while an unresolved request entry exists for the buyer', async () => {
    const { hasOpenExistingBuyerAccessRequest } = await import('@/lib/server/buyer-access-accounts');
    openEntryRows = [{ source_entity_id: 'b1' }];
    await expect(hasOpenExistingBuyerAccessRequest({ schema: () => ({ from: () => chain(() => openEntryRows) }) }, TENANT, 'b1')).resolves.toBe(true);
    openEntryRows = [];
    await expect(hasOpenExistingBuyerAccessRequest({ schema: () => ({ from: () => chain(() => openEntryRows) }) }, TENANT, 'b1')).resolves.toBe(false);
  });
});
