import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const fetchCustomersLandingTableMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

vi.mock('@/lib/server/customers-landing-table', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/customers-landing-table')>(
    '@/lib/server/customers-landing-table',
  );
  return {
    ...actual,
    fetchCustomersLandingTable: (...args: unknown[]) => fetchCustomersLandingTableMock(...args),
  };
});

import { GET } from '../../app/api/tenant/customers/route';

describe('customers landing route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);
    fetchCustomersLandingTableMock.mockResolvedValue({
      buyers: [],
      nextCursor: null,
      total: null,
      sort: 'invoice_value',
      period_start: '2026-04-01',
      grain: 'quarter',
    });
  });

  it('reads V4 table with bounded limit', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/customers?limit=50'));

    expect(response.status).toBe(200);
    expect(fetchCustomersLandingTableMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        limit: 50,
        sort: 'invoice_value',
        filterPreset: null,
      }),
    );
  });

  it('forwards filter_preset JSON to the table helper', async () => {
    const preset = encodeURIComponent(JSON.stringify({ overdue: true }));
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/tenant/customers?filter_preset=${preset}`),
    );

    expect(response.status).toBe(200);
    expect(fetchCustomersLandingTableMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filterPreset: { overdue: true },
      }),
    );
  });
});
