import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const fetchWhatsappNotificationContextMock = vi.fn();
const sendOrderReceivedBuyerMock = vi.fn().mockResolvedValue(undefined);
const sendOrderReceivedSellerMock = vi.fn().mockResolvedValue(undefined);
const insertSingleMock = vi.fn();
const countMock = vi.fn();
const orderSelectMock = {
  eq: vi.fn(() => ({
    eq: vi.fn(() => ({
      is: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({
            data: [],
            error: null,
          })),
        })),
      })),
    })),
  })),
  count: countMock,
};

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/notification-context', () => ({
  fetchWhatsappNotificationContext: (...args: unknown[]) => fetchWhatsappNotificationContextMock(...args),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: vi.fn().mockResolvedValue({
    create_sales_orders: true,
  }),
}));

vi.mock('@/lib/server/whatsapp', () => ({
  sendOrderReceivedBuyer: (...args: unknown[]) => sendOrderReceivedBuyerMock(...args),
  sendOrderReceivedSeller: (...args: unknown[]) => sendOrderReceivedSellerMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn(() => orderSelectMock),
            insert: vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingleMock })) })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
          };
        }
        if (table === 'order_items') {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }
        if (table === 'tenant_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { settings: { business_policy: { gst_inclusive: false, gst_rate: 18 } } },
                  error: null,
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }),
    })),
  },
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogClient: () => ({
    capture: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('buyer orders route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue({ count: 0, error: null });
    insertSingleMock.mockResolvedValue({
      data: { id: 'ord-abc', order_number: 'ORD-2026-0001' },
      error: null,
    });
    fetchWhatsappNotificationContextMock.mockResolvedValue({
      sellerPhone: '9001112222',
      sellerName: 'WineYard Dist.',
      sellerLocation: 'Mumbai Warehouse',
      buyerPhone: '9876543210',
      buyerName: 'Ravi',
      etaHours: 24,
    });
  });

  it('returns the preview empty-state message in preview mode', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'seller-1',
        tenant_id: 'tenant-1',
        role: 'buyer_admin',
        buyer_id: null,
        mode: 'preview',
        share_token: 'tok',
        preview: { tenant_id: 'tenant-1', role: 'buyer_admin', share_token: 'tok', exp: 9999999999, iat: 1, typ: 'buyer_preview_v1' },
      },
      buyer: null,
      tenant: { id: 'tenant-1', business_name: 'Yukti Demo', slug: 'yukti-demo' },
    });

    const { GET } = await import('../../app/api/buyer/orders/route');
    const response = await GET(new Request('http://localhost/api/buyer/orders') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      mode: 'preview',
      orders: [],
      nextCursor: null,
      total: null,
      seller_preview: true,
    });
  });

  it('creates an order with routing details and sends whatsapp notifications', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'buyer_admin',
        buyer_id: 'buyer-1',
        mode: 'buyer',
        share_token: null,
        preview: null,
      },
      buyer: { id: 'buyer-1', phone: '9876543210', contact_name: 'Ravi', business_name: 'Ravi Wines' },
      tenant: { id: 'tenant-1', business_name: 'WineYard', slug: 'wineyard' },
    });

    const { POST } = await import('../../app/api/buyer/orders/route');
    const response = await POST(new Request('http://localhost/api/buyer/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ tenant_product_id: 'prod-1', qty: 2, unit_price: 500 }],
        location_id: 'loc-1',
        place_of_supply: 'Andheri East',
      }),
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.whatsapp_sent).toBe(true);
    expect(fetchWhatsappNotificationContextMock).toHaveBeenCalledWith(
      'tenant-1',
      'buyer-1',
      'loc-1',
      'order_placed',
    );
    expect(sendOrderReceivedBuyerMock).toHaveBeenCalledTimes(1);
    expect(sendOrderReceivedSellerMock).toHaveBeenCalledTimes(1);
  });
});
