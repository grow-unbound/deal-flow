import { describe, expect, it, vi, beforeEach } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getCatalogComposerPayloadMock = vi.fn();
const getRequestSupabaseClientMock = vi.fn();
const state: { supabaseAdmin: { schema: ReturnType<typeof vi.fn> } | null } = {
  supabaseAdmin: { schema: vi.fn() },
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/catalog-composer', () => ({
  getCatalogComposerPayload: (...args: unknown[]) => getCatalogComposerPayloadMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  get supabaseAdmin() {
    return state.supabaseAdmin;
  },
}));

vi.mock('@/lib/server/request-supabase', () => ({
  getRequestSupabaseClient: (...args: unknown[]) => getRequestSupabaseClientMock(...args),
}));

import { GET } from '../../../app/api/tenant/catalogs/composer/route';

describe('catalog composer route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getCatalogComposerPayloadMock.mockReset();
    getRequestSupabaseClientMock.mockReset();
    state.supabaseAdmin = { schema: vi.fn() };
  });

  it('returns the catalog composer payload for sellers', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
    getCatalogComposerPayloadMock.mockResolvedValue({ buyer_count: 2, cohorts: [], products: [] });

    const res = await GET(new Request('http://localhost/api/tenant/catalogs/composer') as any);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.buyer_count).toBe(2);
  });

  it('falls back to request-scoped supabase when the service key is unavailable', async () => {
    state.supabaseAdmin = null;
    const requestDb = { schema: vi.fn() };
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
    getRequestSupabaseClientMock.mockReturnValue(requestDb);
    getCatalogComposerPayloadMock.mockResolvedValue({ buyer_count: 0, cohorts: [], products: [] });

    const res = await GET(new Request('http://localhost/api/tenant/catalogs/composer') as any);

    expect(res.status).toBe(200);
    expect(getRequestSupabaseClientMock).toHaveBeenCalledTimes(1);
    expect(getCatalogComposerPayloadMock).toHaveBeenCalledWith(requestDb, 'tenant-a');
  });
});
