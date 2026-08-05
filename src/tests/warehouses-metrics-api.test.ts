import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    }),
  },
}));

import { GET } from '../../app/api/tenant/warehouses/metrics/route';

describe('warehouses metrics api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });
    rpcMock.mockResolvedValue({
      data: {
        page_key: 'warehouses',
        period: {
          period_key: 'this_quarter',
          grain: 'quarter',
          period_start: '2026-07-01',
          period_end_exclusive: '2026-10-01',
        },
        computed_at: '2026-07-05T10:00:00.000Z',
        source_watermark: '2026-07-05T10:00:00.000Z',
        cards: [{ id: 'sellable_units', label: 'Sellable Units in stock', value: 12 }],
      },
      error: null,
    });
  });

  it('calls get_landing_metrics_v4 for warehouses this_quarter', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/metrics'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.cards).toHaveLength(1);
    expect(rpcMock).toHaveBeenCalledWith('get_landing_metrics_v4', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_page_key: 'warehouses',
      p_period_key: 'this_quarter',
      p_scope_kind: 'tenant',
      p_scope_id: null,
    }));
  });

  it('blocks seller assistants from admin-only warehouse metrics', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/warehouses/metrics'));
    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
