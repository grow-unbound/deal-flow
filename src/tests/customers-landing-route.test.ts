import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    })),
  },
}));

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
    rpcMock.mockResolvedValue({
      data: {
        buyers: [],
        callouts: {
          needs_call: [],
          win_back: [],
        },
        kpis: {
          total: 0,
          cohort_count: 0,
          active: 0,
          active_pct: 0,
          spend_mtd: 0,
          spend_growth_pct: 0,
          dormant_over_30d: 0,
          outstanding_dues: 0,
          buyers_with_dues: 0,
          invoiced_customer_count: 0,
          overdue_sum: 0,
          overdue_customer_count: 0,
          dormant_prior_year_value: 0,
        },
        total: 0,
        nextCursor: { n: 'Acme', i: 'buyer-1' },
      },
      error: null,
    });
  });

  it('uses bounded preview mode by default', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/customers?limit=50'));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('metrics_v2_customers_landing', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_limit: 50,
      p_full_callout: null,
    }));

    const body = await response.json();
    expect(body.nextCursor).toBe(Buffer.from(JSON.stringify({ n: 'Acme', i: 'buyer-1' })).toString('base64url'));
  });

  it('opts into a full lazy callout payload only when requested', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/customers?callout=needs_call'));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('metrics_v2_customers_landing', expect.objectContaining({
      p_full_callout: 'needs_call',
    }));
  });

  it('ignores unknown callout ids and stays in preview mode', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/customers?callout=not-real'));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('metrics_v2_customers_landing', expect.objectContaining({
      p_full_callout: null,
    }));
  });
});
