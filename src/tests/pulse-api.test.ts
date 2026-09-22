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

import { GET as getContribution } from '../../app/api/tenant/pulse/contribution/route';
import { GET as getOpportunities } from '../../app/api/tenant/pulse/opportunities/route';
import { GET as getOpportunityBuyers } from '../../app/api/tenant/pulse/opportunities/[id]/buyers/route';

const rpcPortfolio = {
  as_of: '2026-09-22T04:00:00.000Z',
  source_watermark: '2026-09-22T03:45:00.000Z',
  primary_demand_kind: 'orders',
  metrics: [
    {
      id: 'app_sourced_demand_value_share',
      time_basis: 'QTD',
      available: true,
      count: 2,
      meta: { app_demand_value_90d: 200000 },
    },
    {
      id: 'customers_submitting_app_demand',
      time_basis: 'QTD',
      available: true,
      count: 2,
    },
  ],
  actions: [
    {
      id: 'valuable_assisted_customers_without_access',
      time_basis: 'NOW + QTD',
      available: true,
      count: 1,
      meta: { rows: [{ buyer_id: 'buyer-1', name: 'Alpha Retail', invoice_value_qtd: 150000, invoice_count_qtd: 3 }] },
    },
  ],
  explore: [],
};

describe('Pulse API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    rpcMock.mockResolvedValue({ data: rpcPortfolio, error: null });
  });

  it('loads contribution from the existing buyer-app v4 RPC with assistant location scope', async () => {
    const response = await getContribution(new NextRequest('http://localhost/api/tenant/pulse/contribution'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cards[0].id).toBe('demand_captured');
    expect(rpcMock).toHaveBeenCalledWith('get_buyer_app_dashboard_v4', {
      p_tenant_id: 'tenant-1',
      p_role: 'seller_assistant',
      p_location_ids: ['loc-1'],
    });
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Server-Timing')).toContain('pulse_contribution_api');
  });

  it('loads seller-admin contribution from landing metrics instead of the heavier portfolio RPC', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });
    rpcMock.mockResolvedValueOnce({
      data: {
        page_key: 'buyer_app',
        period: {
          period_key: 'this_quarter',
          grain: 'quarter',
          period_start: '2026-07-01',
          period_end_exclusive: '2026-10-01',
          label: 'This Quarter',
        },
        computed_at: '2026-09-22T04:00:00.000Z',
        source_watermark: '2026-09-22T03:45:00.000Z',
        cards: [
          { id: 'app_sourced_demand_qtd', value: 200000, entity_count: 2, document_count: 2, time_basis: 'quarter' },
        ],
      },
      error: null,
    });

    const response = await getContribution(new NextRequest('http://localhost/api/tenant/pulse/contribution'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('app.get_landing_metrics_v4');
    expect(rpcMock).toHaveBeenCalledWith('get_landing_metrics_v4', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_page_key: 'buyer_app',
      p_period_key: 'this_quarter',
      p_scope_kind: 'tenant',
      p_scope_id: null,
    }));
  });

  it('returns opportunities through an independently callable boundary', async () => {
    const response = await getOpportunities(new NextRequest('http://localhost/api/tenant/pulse/opportunities'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.groups[0].id).toBe('valuable_assisted_customers_without_access');
    expect(response.headers.get('Server-Timing')).toContain('pulse_opportunities_api');
  });

  it('returns a paginated opportunity buyer resultset for the slide-over', async () => {
    const response = await getOpportunityBuyers(
      new NextRequest('http://localhost/api/tenant/pulse/opportunities/valuable_assisted_customers_without_access/buyers?limit=1'),
      { params: Promise.resolve({ id: 'valuable_assisted_customers_without_access' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.group.id).toBe('valuable_assisted_customers_without_access');
    expect(body.rows).toEqual([
      expect.objectContaining({
        buyer_id: 'buyer-1',
        supporting_text: '₹1,50,000 · 3 invoices',
      }),
    ]);
    expect(body.nextCursor).toBeNull();
    expect(response.headers.get('Server-Timing')).toContain('pulse_opportunity_buyers_api');
  });

  it('does not query the database for an unassigned seller assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: [],
    });

    const response = await getOpportunities(new NextRequest('http://localhost/api/tenant/pulse/opportunities'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.groups).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects non-seller roles before the RPC', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      location_ids: null,
    });

    const response = await getContribution(new NextRequest('http://localhost/api/tenant/pulse/contribution'));

    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
