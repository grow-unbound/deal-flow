import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const queryState: { exists: boolean; tenantId: string; status: string } = { exists: true, tenantId: 'tenant-a', status: 'draft' };

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogQueryClient: () => ({ query: vi.fn().mockResolvedValue({ results: [] }) }),
}));

vi.mock('@/lib/server/catalog-composer', () => ({
  getCatalogComposerPayload: vi.fn().mockResolvedValue({ products: [] }),
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
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      if (!queryState.exists) return { data: null, error: null };
      return { data: { id: (chain as any)._id ?? 'c1', tenant_id: queryState.tenantId, status: queryState.status }, error: null };
    }),
    single: vi.fn(async () => ({ data: { id: 'c1', tenant_id: queryState.tenantId }, error: null })),
  } as any;

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({
        from: vi.fn(() => chain),
      })),
    },
  };
});

import { GET } from '../../../../app/api/tenant/catalogs/[id]/route';

describe('catalog detail route security', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    queryState.exists = true;
    queryState.tenantId = 'tenant-a';
    queryState.status = 'draft';
  });

  it('returns 404 for unknown catalog id', async () => {
    queryState.exists = false;
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/tenant/catalogs/missing') as any, {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 403 when catalog belongs to another tenant', async () => {
    queryState.exists = true;
    queryState.tenantId = 'tenant-b';
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/tenant/catalogs/other') as any, {
      params: Promise.resolve({ id: 'other' }),
    });

    expect(res.status).toBe(403);
  });
});
