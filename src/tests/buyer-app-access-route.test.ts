import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
  decodeJWTPayload: vi.fn(),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({ rpc: (...args: unknown[]) => rpcMock(...args) })),
  },
}));

import { GET } from '../../app/api/tenant/buyer-app/access/route';

const rpcResponse = {
  summary_authoritative: false,
  kpis: null,
  buyers: [
    {
      id: 'buyer-3',
      business_name: 'Alpha Retail',
      contact_name: 'Asha',
      phone: '9999999991',
      city: 'Hyderabad',
      state: 'Telangana',
      buyer_app_enabled: false,
      last_app_order_at: null,
      offline_spend_90d: 10_000,
      total_spend_90d: 10_000,
      app_gmv_90d: 0,
      is_suggested: true,
      is_inactive: false,
    },
  ],
  filtered_count: 1,
  has_more: false,
  limit: 25,
  offset: 25,
};

describe('GET /api/tenant/buyer-app/access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);
    rpcMock.mockResolvedValue({ data: rpcResponse, error: null });
  });

  it('pushes search, derived segment, recency, sort, and pagination into the RPC', async () => {
    const response = await GET(new NextRequest(
      'http://localhost:3000/api/tenant/buyer-app/access'
      + '?limit=25&offset=25&q=alp&status=suggested&last_ordered=dormant&sort=offline_spend',
    ));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('search_buyer_app_access', {
      p_tenant_id: 'tenant-1',
      p_query: 'alp',
      p_segment: 'suggested',
      p_last_ordered: 'dormant',
      p_sort: 'offline_spend',
      p_location_ids: null,
      p_limit: 25,
      p_offset: 25,
      p_include_summary: false,
    });
    expect(await response.json()).toEqual(rpcResponse);
  });

  it('passes assistant location scope directly to the authoritative RPC', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
      location_ids: ['loc-1', 'loc-2'],
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/buyer-app/access?status=inactive'),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'search_buyer_app_access',
      expect.objectContaining({
        p_segment: 'inactive',
        p_location_ids: ['loc-1', 'loc-2'],
        p_include_summary: false,
      }),
    );
  });

  it('requests authoritative counts only for the unfiltered first page', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/buyer-app/access?limit=25'),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      'search_buyer_app_access',
      expect.objectContaining({
        p_query: null,
        p_segment: 'all',
        p_offset: 0,
        p_include_summary: true,
      }),
    );
  });

  it('rejects unknown filters before reaching the database', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/buyer-app/access?status=unknown'),
    );

    expect(response.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns an empty scoped response without querying for an unassigned assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
      location_ids: [],
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/buyer-app/access?limit=20'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      summary_authoritative: true,
      buyers: [],
      filtered_count: 0,
      has_more: false,
      limit: 20,
      offset: 0,
    }));
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
