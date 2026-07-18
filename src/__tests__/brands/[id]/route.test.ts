import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVerifiedClaimsMock = vi.fn();

const queryState: { exists: boolean; tenantId: string } = { exists: true, tenantId: 'tenant-a' };

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'id') {
        (chain as any)._id = value;
      }
      if (column === 'tenant_id') {
        (chain as any)._tenant = value;
      }
      return chain;
    }),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: [], error: null })),
    maybeSingle: vi.fn(async () => {
      if (!queryState.exists) return { data: null, error: null };
      return { data: { id: (chain as any)._id ?? 'b1', tenant_id: queryState.tenantId }, error: null };
    }),
  } as any;

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({
        from: vi.fn(() => chain),
        rpc: vi.fn(async () => ({ data: {}, error: null })),
      })),
    },
  };
});

import { GET } from '../../../../app/api/tenant/brands/[id]/route';

describe('brand detail route security', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    queryState.exists = true;
    queryState.tenantId = 'tenant-a';
  });

  it('returns 404 for unknown brand id', async () => {
    queryState.exists = false;
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/tenant/brands/missing') as any, {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 403 when brand belongs to another tenant', async () => {
    queryState.exists = true;
    queryState.tenantId = 'tenant-b';
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/tenant/brands/other') as any, {
      params: Promise.resolve({ id: 'other' }),
    });

    expect(res.status).toBe(403);
  });
});
