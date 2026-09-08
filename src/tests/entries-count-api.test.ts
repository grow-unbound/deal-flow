import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();
const getSellerLocationScopeMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
  },
}));
vi.mock('@/lib/server/seller-location-access', () => ({
  getSellerLocationScope: (...args: unknown[]) => getSellerLocationScopeMock(...args),
}));

import { GET } from '../../app/api/tenant/entries/count/route';

describe('GET /api/tenant/entries/count', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    rpcMock.mockReset();
    getSellerLocationScopeMock.mockReset();
  });

  it('returns 0 when the caller has no location scope', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 't1', sub: 'u1', role: 'seller_assistant' });
    getSellerLocationScopeMock.mockReturnValue({ mode: 'none', locationIds: [] });
    const res = await GET(new NextRequest('http://localhost/api/tenant/entries/count'));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);
  });

  it('returns the row count from list_entries', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 't1', sub: 'u1', role: 'seller_admin' });
    getSellerLocationScopeMock.mockReturnValue({ mode: 'all', locationIds: null });
    rpcMock.mockResolvedValue({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null });
    const res = await GET(new NextRequest('http://localhost/api/tenant/entries/count'));
    const body = await res.json();
    expect(body.count).toBe(3);
  });
});
