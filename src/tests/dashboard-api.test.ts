import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getSellerDashboardDataMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-dashboard', () => ({
  getSellerDashboardData: (...args: unknown[]) => getSellerDashboardDataMock(...args),
}));

import { GET } from '../../app/api/tenant/dashboard/route';

describe('dashboard API route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getSellerDashboardDataMock.mockReset();
  });

  it('returns a role-aware dashboard payload for seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      sub: 'user-1',
      location_ids: ['loc-1'],
    });
    getSellerDashboardDataMock.mockResolvedValue({
      role: 'seller_assistant',
      tenant: { id: 'tenant-1', business_name: 'WineYard', subdomain: 'wineyard', plan: 'growth', location_names: ['Mumbai HQ'] },
      period: { selected: 'week' },
      assistant: { metrics: [], callouts: [], feeds: [] },
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/dashboard?period=week'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.role).toBe('seller_assistant');
    expect(body.tenant.business_name).toBe('WineYard');
    expect(getSellerDashboardDataMock).toHaveBeenCalled();
  });

  it('rejects non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      sub: 'user-1',
      location_ids: null,
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/dashboard'));
    expect(response.status).toBe(403);
  });
});
