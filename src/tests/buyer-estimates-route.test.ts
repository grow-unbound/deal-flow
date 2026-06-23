import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks must be declared before any imports that trigger module resolution
const requireBuyerAccessProfileMock = vi.fn();
const fetchWhatsappNotificationContextMock = vi.fn();
const sendRequestReceivedBuyerMock = vi.fn().mockResolvedValue(undefined);
const sendRequestReceivedSellerMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/notification-context', () => ({
  fetchWhatsappNotificationContext: (...args: unknown[]) =>
    fetchWhatsappNotificationContextMock(...args),
}));

vi.mock('@/lib/server/whatsapp', () => ({
  sendRequestReceivedBuyer: (...args: unknown[]) => sendRequestReceivedBuyerMock(...args),
  sendRequestReceivedSeller: (...args: unknown[]) => sendRequestReceivedSellerMock(...args),
}));

const insertSingleMock = vi.fn();
const countMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'estimates') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    is: vi.fn(() => ({
                      limit: vi.fn(async () => ({ data: [], error: null })),
                    })),
                  })),
                })),
              })),
              count: countMock,
            })),
            insert: vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingleMock })) })),
          };
        }
        if (table === 'estimate_items') {
          return {
            insert: vi.fn(async () => ({ error: null })),
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

const PREVIEW_PROFILE = {
  context: {
    sub: 'seller-1',
    tenant_id: 'tenant-1',
    role: 'buyer_admin',
    buyer_id: null,
    mode: 'preview' as const,
    share_token: 'tok',
    preview: { tenant_id: 'tenant-1', role: 'buyer_admin', share_token: 'tok', exp: 9999999999, iat: 1, typ: 'buyer_preview_v1' },
  },
  buyer: null,
  tenant: { id: 'tenant-1', business_name: 'Yukti Demo', slug: 'yukti-demo' },
};

const BUYER_PROFILE = {
  context: {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    role: 'buyer_admin',
    buyer_id: 'buyer-1',
    mode: 'buyer' as const,
    share_token: null,
    preview: null,
  },
  buyer: { id: 'buyer-1', phone: '9876543210', contact_name: 'Ravi', business_name: 'Ravi Wines' },
  tenant: { id: 'tenant-1', business_name: 'WineYard', slug: 'wineyard' },
};

const VALID_ITEMS = [
  { tenant_product_id: 'prod-1', qty: 2, unit_price: 500 },
  { tenant_product_id: 'prod-2', qty: 1, unit_price: 1000 },
];

describe('buyer estimates route (POST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue({ count: 0, error: null });
    insertSingleMock.mockResolvedValue({
      data: { id: 'est-abc', estimate_number: 'EST-2026-0001' },
      error: null,
    });
    fetchWhatsappNotificationContextMock.mockResolvedValue(null);
  });

  it('returns preview estimate without DB writes in preview mode', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(PREVIEW_PROFILE);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({ items: VALID_ITEMS }),
    });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.estimate_number).toBe('PREVIEW-INQUIRY');
    expect(body.whatsapp_sent).toBe(false);
    expect(insertSingleMock).not.toHaveBeenCalled();
  });

  it('rejects an empty items array with 400', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('creates estimate and fires whatsapp notifications when context is available', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);
    const ctx = {
      sellerPhone: '9001112222',
      sellerName: 'WineYard Dist.',
      sellerLocation: 'Mumbai Warehouse',
      buyerPhone: '9876543210',
      buyerName: 'Ravi',
      etaHours: 24,
    };
    fetchWhatsappNotificationContextMock.mockResolvedValue(ctx);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({ items: VALID_ITEMS }),
    });
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.whatsapp_sent).toBe(true);

    // Allow IIFE to run
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchWhatsappNotificationContextMock).toHaveBeenCalledWith(
      'tenant-1',
      'buyer-1',
      null,
      'enquiry_received',
    );
    expect(sendRequestReceivedBuyerMock).toHaveBeenCalledWith(
      ctx,
      'est-abc',
      'EST-2026-0001',
      expect.any(Number),
      2,
    );
    expect(sendRequestReceivedSellerMock).toHaveBeenCalledWith(
      ctx,
      'est-abc',
      'EST-2026-0001',
      expect.any(Number),
      2,
    );
  });

  it('does not fire whatsapp when notification context is null (flag disabled or phone missing)', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);
    fetchWhatsappNotificationContextMock.mockResolvedValue(null);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({ items: VALID_ITEMS }),
    });
    await POST(request as never);

    await new Promise((r) => setTimeout(r, 10));
    expect(sendRequestReceivedBuyerMock).not.toHaveBeenCalled();
    expect(sendRequestReceivedSellerMock).not.toHaveBeenCalled();
  });
});
