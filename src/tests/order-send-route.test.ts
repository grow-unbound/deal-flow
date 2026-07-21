import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const fetchWhatsappNotificationContextMock = vi.fn();
const sendOrderReceivedBuyerMock = vi.fn();

const state = {
  order: {
    id: 'ord-1',
    tenant_id: 'tenant-1',
    status: 'received',
    buyer_id: 'buyer-1',
    location_id: 'loc-1',
    order_number: 'SO-001',
    total_amount: 1200,
  },
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/notification-context', () => ({
  fetchWhatsappNotificationContext: (...args: unknown[]) => fetchWhatsappNotificationContextMock(...args),
}));

vi.mock('@/lib/server/whatsapp', () => ({
  sendOrderReceivedBuyer: (...args: unknown[]) => sendOrderReceivedBuyerMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private countHead = false;

    constructor(private readonly table: string) {}

    select(_value?: string, opts?: { count?: string; head?: boolean }) {
      this.countHead = Boolean(this.table === 'order_items' && opts?.head);
      return this;
    }
    eq() {
      return this;
    }
    is() {
      return this;
    }
    maybeSingle() {
      if (this.table === 'orders') {
        return Promise.resolve({ data: state.order, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
    insert() {
      return this;
    }
    then(resolve: (value: { data: unknown; error: null; count?: number }) => void) {
      if (this.countHead) {
        resolve({ data: [], error: null, count: 2 });
        return;
      }
      resolve({ data: [], error: null });
    }
  }

  return {
    supabaseAdmin: {
      schema: () => ({
        from: (table: string) => new QueryMock(table),
      }),
    },
  };
});

describe('PATCH /api/tenant/orders/[id]/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    fetchWhatsappNotificationContextMock.mockResolvedValue({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      buyerPhone: '9999999999',
      buyerName: 'Buyer',
      sellerPhone: '8888888888',
      sellerName: 'Seller',
      sellerLocation: 'North',
      buyerFacingSellerName: 'Seller',
      etaHours: 24,
    });
    sendOrderReceivedBuyerMock.mockResolvedValue(true);
  });

  it('enqueues buyer WhatsApp when channel is whatsapp', async () => {
    const { PATCH } = await import('../../app/api/tenant/orders/[id]/send/route');
    const request = new NextRequest('http://localhost/api/tenant/orders/ord-1/send', {
      method: 'PATCH',
      body: JSON.stringify({
        channel: 'whatsapp',
        recipient: '9999999999',
        message: 'Please review this sales order.',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'ord-1' }) });
    expect(response.status).toBe(200);
    expect(sendOrderReceivedBuyerMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', buyerId: 'buyer-1' }),
      'ord-1',
      'SO-001',
      1200,
      2,
    );
  });
});
