import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getInAppCreateFlagsMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: (...args: unknown[]) => getInAppCreateFlagsMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    constructor(private readonly table: string) {}

    select() {
      return this;
    }
    eq() {
      return this;
    }
    is() {
      return this;
    }
    maybeSingle() {
      if (this.table === 'estimates') {
        return Promise.resolve({
          data: {
            id: 'est-1',
            tenant_id: 'tenant-1',
            status: 'accepted',
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }
    insert() {
      return Promise.resolve({ data: [], error: null });
    }
  }

  return {
    supabaseAdmin: {
      schema: () => ({
        from: (table: string) => new QueryMock(table),
        rpc: (...args: unknown[]) => rpcMock(...args),
      }),
    },
  };
});

describe('estimate conversion routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
    getInAppCreateFlagsMock.mockResolvedValue({ create_invoices: true });
    rpcMock.mockResolvedValue({ data: { order_id: 'ord-1', invoice_id: 'inv-1' }, error: null });
  });

  it('passes delivery_date to estimate_convert_to_order without dropping qty overrides', async () => {
    const { PATCH } = await import('../../app/api/tenant/estimates/[id]/convert/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/tenant/estimates/est-1/convert', {
        method: 'PATCH',
        body: JSON.stringify({
          delivery_date: '2026-07-10',
          line_ids: ['11111111-1111-1111-1111-111111111111'],
          qty_overrides: { '11111111-1111-1111-1111-111111111111': 4 },
          order_number: 'SO-1009',
        }),
      }),
      { params: Promise.resolve({ id: 'est-1' }) },
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('estimate_convert_to_order', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_estimate_id: 'est-1',
      p_actor_user_id: 'user-1',
      p_expected_delivery: '2026-07-10',
      p_line_ids: ['11111111-1111-1111-1111-111111111111'],
      p_order_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      p_order_number_override: 'SO-1009',
      p_qty_overrides: { '11111111-1111-1111-1111-111111111111': 4 },
    }));
  });

  it('passes invoice_date to estimate_convert_to_invoice with the aligned RPC signature', async () => {
    const { PATCH } = await import('../../app/api/tenant/estimates/[id]/convert-to-invoice/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/tenant/estimates/est-1/convert-to-invoice', {
        method: 'PATCH',
        body: JSON.stringify({
          invoice_date: '2026-07-11',
          line_ids: ['11111111-1111-1111-1111-111111111111'],
          qty_overrides: { '11111111-1111-1111-1111-111111111111': 2 },
          invoice_number: 'INV-1011',
        }),
      }),
      { params: Promise.resolve({ id: 'est-1' }) },
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('estimate_convert_to_invoice', {
      p_tenant_id: 'tenant-1',
      p_estimate_id: 'est-1',
      p_actor_user_id: 'user-1',
      p_invoice_date: '2026-07-11',
      p_line_ids: ['11111111-1111-1111-1111-111111111111'],
      p_invoice_number_override: 'INV-1011',
      p_qty_overrides: { '11111111-1111-1111-1111-111111111111': 2 },
    });
  });
});
