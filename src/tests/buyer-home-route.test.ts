import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const loadBuyerActivityFeedMock = vi.fn();
const getVisibleBuyerCatalogsMock = vi.fn();
const assembleBuyerCatalogItemsForProductIdsMock = vi.fn();
const recordBuyerAppActivitySafeMock = vi.fn();
const campaignItemsSelectMock = vi.fn();
const campaignItemsTenantEqMock = vi.fn();
const campaignItemsInMock = vi.fn();
const campaignItemsIsMock = vi.fn();
const orderItemsSelectMock = vi.fn();
const orderItemsTenantEqMock = vi.fn();
const orderItemsBuyerEqMock = vi.fn();
const orderItemsInMock = vi.fn();
const orderItemsIsMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
  getVisibleBuyerCatalogs: (...args: unknown[]) => getVisibleBuyerCatalogsMock(...args),
}));

vi.mock('@/lib/server/buyer-activity', () => ({
  loadBuyerActivityFeed: (...args: unknown[]) => loadBuyerActivityFeedMock(...args),
}));

vi.mock('@/lib/server/buyer-assemble-catalog-items', () => ({
  assembleBuyerCatalogItemsForProductIds: (...args: unknown[]) => assembleBuyerCatalogItemsForProductIdsMock(...args),
}));

vi.mock('@/lib/server/buyer-app-activity', () => ({
  recordBuyerAppActivitySafe: (...args: unknown[]) => recordBuyerAppActivitySafeMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      rpc: vi.fn((fnName: string) => {
        if (schemaName === 'app' && fnName === 'get_buyer_home_summary') {
          return Promise.resolve({
            data: [{
              gmv_mtd: 10000,
              gmv_ytd: 45000,
              invoice_count_ytd: 3,
              trend_vs_last_month_pct: 25,
              outstanding_dues: 8000,
              open_invoice_count: 2,
              earliest_due_date: '2026-06-22',
              days_until_earliest_due: 1,
              credit_limit: 50000,
              available_credit: 42000,
              credit_used: 8000,
              open_orders_count: 4,
            }],
            error: null,
          });
        }

        throw new Error(`Unexpected rpc: ${schemaName}.${fnName}`);
      }),
      from: vi.fn((tableName: string) => {
        if (schemaName === 'app' && tableName === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(async () => ({
                        data: [{ id: 'ord-1', status: 'received', placed_at: '2026-06-10T00:00:00.000Z' }],
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }

        if (schemaName === 'app' && tableName === 'order_items') {
          return {
            select: orderItemsSelectMock.mockImplementation(() => ({
              eq: orderItemsTenantEqMock.mockImplementation(() => ({
                eq: orderItemsBuyerEqMock.mockImplementation(() => ({
                  in: orderItemsInMock.mockImplementation(() => ({
                    is: orderItemsIsMock.mockImplementation(async () => ({
                      data: [{ order_id: 'ord-1', tenant_product_id: 'tp-1' }],
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          };
        }

        if (schemaName === 'app' && tableName === 'campaign_items') {
          return {
            select: campaignItemsSelectMock.mockImplementation(() => ({
              eq: campaignItemsTenantEqMock.mockImplementation(() => ({
                in: campaignItemsInMock.mockImplementation(() => ({
                  is: campaignItemsIsMock.mockImplementation(async () => ({
                    data: [{ campaign_id: 'promo-1' }],
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }

        if (schemaName === 'app' && tableName === 'buyers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { default_cohort_id: null },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }

        if (schemaName === 'app' && tableName === 'cohort_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [],
                error: null,
              })),
            })),
          };
        }

        throw new Error(`Unexpected query: ${schemaName}.${tableName}`);
      }),
    })),
  },
}));

describe('buyer home route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    loadBuyerActivityFeedMock.mockReset();
    getVisibleBuyerCatalogsMock.mockReset();
    assembleBuyerCatalogItemsForProductIdsMock.mockReset();
    recordBuyerAppActivitySafeMock.mockReset();
    campaignItemsSelectMock.mockReset();
    campaignItemsTenantEqMock.mockReset();
    campaignItemsInMock.mockReset();
    campaignItemsIsMock.mockReset();
    orderItemsSelectMock.mockReset();
    orderItemsTenantEqMock.mockReset();
    orderItemsBuyerEqMock.mockReset();
    orderItemsInMock.mockReset();
    orderItemsIsMock.mockReset();
  });

  it('returns the new dashboard aggregate shape and scopes second-hop lookups', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1', mode: 'buyer' },
      buyer: { id: 'buyer-1', business_name: 'Rajan Stores', contact_name: 'Rajan', credit_limit: 50000 },
      greeting_name: 'Rajan',
    });
    loadBuyerActivityFeedMock.mockResolvedValue({ items: [{ id: 'order:1' }], next_cursor: 'next' });
    getVisibleBuyerCatalogsMock.mockResolvedValue([
      { id: 'promo-1', name: 'June Promo', share_token: 'tok', valid_to: null, hero_image_url: null },
    ]);
    assembleBuyerCatalogItemsForProductIdsMock.mockResolvedValue(new Map([
      ['tp-1', { tenant_product_id: 'tp-1', display_name: 'Bullet Camera', image_urls: [], price: 900 }],
    ]));

    const { GET } = await import('../../app/api/buyer/home/route');
    const request = Object.assign(new Request('http://localhost/api/buyer/home'), {
      nextUrl: new URL('http://localhost/api/buyer/home'),
    });
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.greeting_name).toBe('Rajan');
    expect(body.summary_card.invoice_count_ytd).toBe(3);
    expect(body.summary_card.gmv_ytd).toBe(45000);
    expect(body.summary_card.trend_vs_last_month_pct).toBe(25);
    expect(body.open_orders_count).toBe(4);
    expect(body.dues_card.outstanding_dues).toBe(8000);
    expect(body.credit_card.available_credit).toBe(42000);
    expect(body.latest_promotions_preview[0].name).toBe('June Promo');
    expect(body.order_again_preview[0].display_name).toBe('Bullet Camera');
    expect(body.recent_activity.items).toHaveLength(1);
    expect(campaignItemsSelectMock).toHaveBeenCalledWith('campaign_id, campaigns!inner(tenant_id)');
    expect(campaignItemsTenantEqMock).toHaveBeenCalledWith('campaigns.tenant_id', 'tenant-1');
    expect(campaignItemsInMock).toHaveBeenCalledWith('campaign_id', ['promo-1']);
    expect(orderItemsSelectMock).toHaveBeenCalledWith('order_id, tenant_product_id, orders!inner(tenant_id, buyer_id)');
    expect(orderItemsTenantEqMock).toHaveBeenCalledWith('orders.tenant_id', 'tenant-1');
    expect(orderItemsBuyerEqMock).toHaveBeenCalledWith('orders.buyer_id', 'buyer-1');
    expect(orderItemsInMock).toHaveBeenCalledWith('order_id', ['ord-1']);
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
