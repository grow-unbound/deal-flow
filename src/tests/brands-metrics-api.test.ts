import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    })),
  },
}));

import { GET } from '../../app/api/tenant/brands/metrics/route';

describe('GET /api/tenant/brands/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
    });
    rpcMock.mockResolvedValue({
      data: {
        page_key: 'brands',
        period: {
          period_key: 'this_month',
          grain: 'month',
          period_start: '2026-08-01',
          period_end_exclusive: '2026-09-01',
        },
        computed_at: '2026-08-05T00:00:00Z',
        source_watermark: '2026-08-05T00:00:00Z',
        cards: [{
          id: 'active_brands',
          label: 'Active brands',
          value: 12,
          filter_preset: { sold_period: 'this_month' },
        }],
      },
      error: null,
    });
  });

  it('calls get_landing_metrics_v4 for brands this_month', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/brands/metrics'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.cards).toHaveLength(1);
    expect(rpcMock).toHaveBeenCalledWith('get_landing_metrics_v4', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_page_key: 'brands',
      p_period_key: 'this_month',
      p_scope_kind: 'tenant',
      p_scope_id: null,
    }));
  });

  it('returns 403 for seller_assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/brands/metrics'));
    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
