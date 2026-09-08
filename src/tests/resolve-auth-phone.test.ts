import { beforeEach, describe, expect, it, vi } from 'vitest';

const { schemaMock, resolveSellerAuthPhoneMock } = vi.hoisted(() => ({
  schemaMock: vi.fn(),
  resolveSellerAuthPhoneMock: vi.fn(),
}));

vi.mock('@/lib/server/buyer-access', () => ({
  resolveSellerAuthPhone: (...args: unknown[]) => resolveSellerAuthPhoneMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

function chain(finalResult: unknown) {
  const q: Record<string, unknown> = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.is = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => finalResult);
  return q;
}

describe('resolveCallerPhone', () => {
  beforeEach(() => {
    schemaMock.mockReset();
    resolveSellerAuthPhoneMock.mockReset();
  });

  it('resolves buyer phone from verified tenant and buyer claims before user_id fallback', async () => {
    const buyersByScope = chain({ data: { phone: '9876543210' } });
    const buyerUsersByScope = chain({ data: null });
    const tableCalls: string[] = [];

    schemaMock.mockReturnValue({
      from: vi.fn((tableName: string) => {
        tableCalls.push(tableName);
        if (tableName === 'buyers') return buyersByScope;
        if (tableName === 'buyer_users') return buyerUsersByScope;
        throw new Error(`Unexpected table ${tableName}`);
      }),
    });

    const { resolveCallerPhone } = await import('@/lib/server/resolve-auth-phone');
    const phone = await resolveCallerPhone('auth-user-1', 'buyer_admin', {
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
    });

    expect(phone).toBe('9876543210');
    expect(tableCalls).toEqual(['buyers']);
    expect(buyersByScope.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(buyersByScope.eq).toHaveBeenCalledWith('id', 'buyer-1');
  });
});
