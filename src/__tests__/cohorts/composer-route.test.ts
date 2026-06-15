import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getCohortComposerPayloadMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/cohort-composer', () => ({
  getCohortComposerPayload: (...args: unknown[]) => getCohortComposerPayloadMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

import { GET } from '../../../app/api/cohorts/composer/route';

describe('cohort composer route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getFlagMock.mockReset();
    getCohortComposerPayloadMock.mockReset();
  });

  it('returns seller composer payload with buyer metrics', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    getCohortComposerPayloadMock.mockResolvedValue({
      buyers: [
        {
          id: 'buyer-1',
          business_name: 'Bharat Stores',
          contact_name: 'Ravi',
          external_ref: 'B-001',
          geography_label: 'Delhi, NCR',
          city: 'Delhi',
          state: 'NCR',
          tier: 'A',
          last_order_at: '2026-06-01T00:00:00.000Z',
          mtd_spend: 240000,
          orders_mtd: 7,
          credit_used: 60000,
          payment_terms_days: 21,
          gmv_90d: 480000,
          initials: 'BS',
          hue: 'teal',
        },
      ],
      filters: {
        geographies: [{ value: 'Delhi, NCR', label: 'Delhi, NCR', count: 1 }],
        tiers: [{ value: 'A', label: 'A', count: 1 }],
        last_order_buckets: [{ value: 'within_30_days', label: 'Within 30 days', count: 1 }],
        gmv_90d_buckets: [{ value: 'gmv_200001_500000', label: '₹2L - ₹5L', count: 1 }],
      },
    });

    const res = await GET(new Request('http://localhost/api/cohorts/composer') as any);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.buyers[0]).toMatchObject({
      business_name: 'Bharat Stores',
      geography_label: 'Delhi, NCR',
      mtd_spend: 240000,
      credit_used: 60000,
      payment_terms_days: 21,
    });
    expect(body.filters.geographies[0].value).toBe('Delhi, NCR');
  });

  it('rejects non-seller access', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'buyer_admin' });

    const res = await GET(new Request('http://localhost/api/cohorts/composer') as any);

    expect(res.status).toBe(403);
  });
});
