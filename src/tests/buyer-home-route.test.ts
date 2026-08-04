import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const loadBuyerHomePromotionsMock = vi.fn();
const loadBuyerHomeRecoMock = vi.fn();
const recordBuyerAppActivitySafeMock = vi.fn();
const getBuyerHomeMetricsRpcMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/buyer-home-promotions', () => ({
  loadBuyerHomePromotions: (...args: unknown[]) => loadBuyerHomePromotionsMock(...args),
}));

vi.mock('@/lib/server/buyer-home-reco', () => ({
  loadBuyerHomeReco: (...args: unknown[]) => loadBuyerHomeRecoMock(...args),
}));

vi.mock('@/lib/server/buyer-app-activity', () => ({
  recordBuyerAppActivitySafe: (...args: unknown[]) => recordBuyerAppActivitySafeMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      rpc: (...args: unknown[]) => {
        if (schemaName === 'app' && args[0] === 'get_buyer_home_metrics_v4') {
          return getBuyerHomeMetricsRpcMock(...args);
        }
        throw new Error(`Unexpected rpc: ${schemaName}.${String(args[0])}`);
      },
    })),
  },
}));

describe('buyer home metrics route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    recordBuyerAppActivitySafeMock.mockReset();
    getBuyerHomeMetricsRpcMock.mockReset();
  });

  it('returns V4 metrics as-is from get_buyer_home_metrics_v4', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1', mode: 'buyer' },
      buyer: { id: 'buyer-1', business_name: 'Rajan Stores', contact_name: 'Rajan', credit_limit: 50000 },
      greeting_name: 'Rajan',
    });
    getBuyerHomeMetricsRpcMock.mockResolvedValue({
      data: {
        period: {
          period_key: 'this_quarter',
          grain: 'quarter',
          period_start: '2026-07-01',
          period_end_exclusive: '2026-10-01',
        },
        spend_qtd: 12500,
        invoice_count_qtd: 4,
        demand_qtd: 8200,
        demand_document_count_qtd: 2,
        demand_kind: 'orders',
        credit_limit: 50000,
        outstanding: 8000,
        overdue: 5000,
        available_credit: 42000,
        computed_at: '2026-08-04T06:30:00.000Z',
      },
      error: null,
    });

    const { GET } = await import('../../app/api/buyer/home/metrics/route');
    const request = Object.assign(new Request('http://localhost/api/buyer/home/metrics'), {
      nextUrl: new URL('http://localhost/api/buyer/home/metrics'),
    });
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.spend_qtd).toBe(12500);
    expect(body.invoice_count_qtd).toBe(4);
    expect(body.demand_kind).toBe('orders');
    expect(body.outstanding).toBe(8000);
    expect(body.available_credit).toBe(42000);
    expect(getBuyerHomeMetricsRpcMock).toHaveBeenCalledWith('get_buyer_home_metrics_v4', {
      p_tenant_id: 'tenant-1',
      p_buyer_id: 'buyer-1',
      p_as_of: expect.any(String),
    });
    expect(recordBuyerAppActivitySafeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
        eventName: 'home_viewed',
      }),
    );
  });
});

describe('buyer home promotions route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    loadBuyerHomePromotionsMock.mockReset();
  });

  it('returns promotions preview payload', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1', mode: 'buyer' },
      buyer: { id: 'buyer-1' },
    });
    loadBuyerHomePromotionsMock.mockResolvedValue({
      latest_promotions_preview: [
        { id: 'promo-1', name: 'June Promo', product_count: 1, share_token: 'tok', valid_until: null, hero_image_url: null },
      ],
    });

    const { GET } = await import('../../app/api/buyer/home/promotions/route');
    const request = Object.assign(new Request('http://localhost/api/buyer/home/promotions'), {
      nextUrl: new URL('http://localhost/api/buyer/home/promotions'),
    });
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latest_promotions_preview[0].name).toBe('June Promo');
    expect(loadBuyerHomePromotionsMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'buyer-1');
  });
});

describe('buyer home reco route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    loadBuyerHomeRecoMock.mockReset();
  });

  it('returns order again and bestsellers preview payload', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1', mode: 'buyer' },
      buyer: { id: 'buyer-1' },
    });
    loadBuyerHomeRecoMock.mockResolvedValue({
      order_again_preview: [{ tenant_product_id: 'tp-1', display_name: 'Bullet Camera', image_urls: [], price: 900 }],
      bestsellers: [],
    });

    const { GET } = await import('../../app/api/buyer/home/reco/route');
    const request = Object.assign(new Request('http://localhost/api/buyer/home/reco'), {
      nextUrl: new URL('http://localhost/api/buyer/home/reco'),
    });
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order_again_preview[0].display_name).toBe('Bullet Camera');
    expect(loadBuyerHomeRecoMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'buyer-1');
  });
});
