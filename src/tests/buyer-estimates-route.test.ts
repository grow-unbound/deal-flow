import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks must be declared before any imports that trigger module resolution
const requireBuyerAccessProfileMock = vi.fn();
const sendImmediateTransactionNotificationsMock = vi.fn();
const estimateInsertPayloads: Array<Record<string, unknown>> = [];

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: vi.fn().mockResolvedValue({
    create_enquiries: true,
  }),
}));

vi.mock('@/lib/server/transaction-outbound-push', () => ({
  tenantDefersTransactionNumber: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/server/buyer-transaction-notify-immediate', () => ({
  sendImmediateTransactionNotifications: (...args: unknown[]) =>
    sendImmediateTransactionNotificationsMock(...args),
}));

vi.mock('@/lib/server/buyer-location-selection', () => ({
  getSelectedBuyerDeliveryFromRequest: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/server/buyer-product-data', () => ({
  resolveBuyerInventoryWarehouseId: vi.fn().mockResolvedValue('wh-1'),
}));

vi.mock('@/lib/server/buyer-cart-stock', () => ({
  validateBuyerCartStock: vi.fn(async (_db, input: { items: unknown[] }) => ({
    ok: true,
    items: input.items,
  })),
}));

vi.mock('@/lib/server/campaign-attribution', () => ({
  inferCampaignIdForBuyerCart: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/server/buyer-app-activity', () => ({
  recordBuyerAppActivitySafe: vi.fn(),
}));


const insertSingleMock = vi.fn();

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
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              estimateInsertPayloads.push(payload);
              return { select: vi.fn(() => ({ single: insertSingleMock })) };
            }),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
          };
        }
        if (table === 'estimate_items') {
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

function withNextUrl(request: Request): Request {
  Object.assign(request, { nextUrl: new URL(request.url) });
  return request;
}

describe('buyer estimates route (POST)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    estimateInsertPayloads.length = 0;
    const { tenantDefersTransactionNumber } = await import('@/lib/server/transaction-outbound-push');
    vi.mocked(tenantDefersTransactionNumber).mockResolvedValue(false);
    insertSingleMock.mockResolvedValue({
      data: { id: 'est-abc', estimate_number: 'EST-2026-0001' },
      error: null,
    });
    sendImmediateTransactionNotificationsMock.mockResolvedValue(true);
  });

  it('returns preview estimate without DB writes in preview mode', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(PREVIEW_PROFILE);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = withNextUrl(new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({
        items: VALID_ITEMS,
        location_id: 'loc-1',
        place_of_supply: 'Andheri East',
      }),
    }));
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.estimate_number).toBe('PREVIEW-INQUIRY');
    expect(body.document_status_note).toBeNull();
    expect(body.whatsapp_sent).toBe(false);
    expect(insertSingleMock).not.toHaveBeenCalled();
  });

  it('rejects an empty items array with 400', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = withNextUrl(new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({ items: [], location_id: 'loc-1' }),
    }));
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('creates estimate and fires whatsapp notifications when integration does not defer numbers', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = withNextUrl(new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({
        items: VALID_ITEMS,
        location_id: 'loc-1',
      }),
    }));
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.document_status_note).toBeNull();
    expect(body.whatsapp_sent).toBe(true);
    expect(sendImmediateTransactionNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'estimate',
        documentId: 'est-abc',
        documentNumber: 'EST-2026-0001',
        itemCount: 2,
      }),
    );
    expect(estimateInsertPayloads[0]).toMatchObject({
      source: 'buyer_app',
      is_buyer_app_estimate: true,
    });
  });

  it('defers whatsapp when outbound integration will assign the document number', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);
    const { tenantDefersTransactionNumber } = await import('@/lib/server/transaction-outbound-push');
    vi.mocked(tenantDefersTransactionNumber).mockResolvedValue(true);
    insertSingleMock.mockResolvedValue({
      data: { id: 'est-abc', estimate_number: null },
      error: null,
    });

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = withNextUrl(new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({
        items: VALID_ITEMS,
        location_id: 'loc-1',
      }),
    }));
    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.estimate_number).toBeNull();
    expect(body.document_status_note).toBe('will be created soon');
    expect(body.whatsapp_sent).toBe(false);
    expect(sendImmediateTransactionNotificationsMock).not.toHaveBeenCalled();
  });

  it('dispatches whatsapp without blocking the response even if the helper later resolves false', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue(BUYER_PROFILE);
    sendImmediateTransactionNotificationsMock.mockResolvedValue(false);

    const { POST } = await import('../../app/api/buyer/estimates/route');
    const request = withNextUrl(new Request('http://localhost/api/buyer/estimates', {
      method: 'POST',
      body: JSON.stringify({
        items: VALID_ITEMS,
        location_id: 'loc-1',
      }),
    }));
    const response = await POST(request as never);
    const body = await response.json();

    // The route no longer awaits the WhatsApp send before responding (it's
    // fire-and-forget so the response isn't held up by an external API call),
    // so `whatsapp_sent` reflects that a dispatch was attempted, not its
    // eventual outcome — which the helper here resolves to `false` for.
    expect(body.document_status_note).toBeNull();
    expect(body.whatsapp_sent).toBe(true);
    expect(sendImmediateTransactionNotificationsMock).toHaveBeenCalled();
  });
});
