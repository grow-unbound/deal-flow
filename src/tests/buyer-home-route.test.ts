import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const loadBuyerCreditSnapshotMock = vi.fn();
const loadBuyerActivityFeedMock = vi.fn();
const getVisibleBuyerCatalogsMock = vi.fn();
const assembleBuyerCatalogItemsForProductIdsMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
  getVisibleBuyerCatalogs: (...args: unknown[]) => getVisibleBuyerCatalogsMock(...args),
}));

vi.mock('@/lib/server/buyer-credit', () => ({
  loadBuyerCreditSnapshot: (...args: unknown[]) => loadBuyerCreditSnapshotMock(...args),
}));

vi.mock('@/lib/server/buyer-activity', () => ({
  loadBuyerActivityFeed: (...args: unknown[]) => loadBuyerActivityFeedMock(...args),
}));

vi.mock('@/lib/server/buyer-assemble-catalog-items', () => ({
  assembleBuyerCatalogItemsForProductIds: (...args: unknown[]) => assembleBuyerCatalogItemsForProductIdsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      from: vi.fn((tableName: string) => {
        if (schemaName === 'app' && tableName === 'invoices') {
          const mtdData = [
            { id: 'inv-1', total_amount: 10000, invoice_date: '2026-06-05T00:00:00.000Z', status: 'sent' },
            { id: 'inv-2', total_amount: 8000, invoice_date: '2026-05-04T00:00:00.000Z', status: 'sent' },
          ];
          const ytdData = [{ id: 'inv-1' }, { id: 'inv-2' }];
          return {
            select: vi.fn(() => {
              const chain: Record<string, any> = {
                __mode: 'mtd',
                eq: vi.fn(() => chain),
                gte: vi.fn(() => {
                  chain.__mode = 'ytd';
                  return chain;
                }),
                is: vi.fn(() => chain),
                neq: vi.fn(async () => ({
                  data: chain.__mode === 'ytd' ? ytdData : mtdData,
                  error: null,
                })),
              };
              return chain;
            }),
          };
        }

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
            select: vi.fn(() => ({
              is: vi.fn(async () => ({
                data: [{ order_id: 'ord-1', tenant_product_id: 'tp-1' }],
                error: null,
              })),
            })),
          };
        }

        if (schemaName === 'app' && tableName === 'published_catalog_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn(async () => ({
                  data: [{ catalog_id: 'promo-1' }],
                  error: null,
                })),
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
    loadBuyerCreditSnapshotMock.mockReset();
    loadBuyerActivityFeedMock.mockReset();
    getVisibleBuyerCatalogsMock.mockReset();
    assembleBuyerCatalogItemsForProductIdsMock.mockReset();
  });

  it('returns the new dashboard aggregate shape', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1', mode: 'buyer' },
      buyer: { id: 'buyer-1', business_name: 'Rajan Stores', contact_name: 'Rajan', credit_limit: 50000 },
      greeting_name: 'Rajan',
    });
    loadBuyerCreditSnapshotMock.mockResolvedValue({
      credit_limit: 50000,
      available_credit: 42000,
      credit_used: 8000,
      outstanding_dues: 8000,
      open_invoice_count: 2,
      earliest_due_date: '2026-06-22',
      days_until_earliest_due: 1,
    });
    loadBuyerActivityFeedMock.mockResolvedValue({ items: [{ id: 'order:1' }], next_cursor: 'next' });
    getVisibleBuyerCatalogsMock.mockResolvedValue([
      { id: 'promo-1', name: 'June Promo', share_token: 'tok', valid_to: null, hero_image_url: null },
    ]);
    assembleBuyerCatalogItemsForProductIdsMock.mockResolvedValue(new Map([
      ['tp-1', { tenant_product_id: 'tp-1', display_name: 'Bullet Camera', image_urls: [], price: 900 }],
    ]));

    const { GET } = await import('../../app/api/buyer/home/route');
    const response = await GET(new Request('http://localhost/api/buyer/home') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.greeting_name).toBe('Rajan');
    expect(body.summary_card.invoice_count_ytd).toBe(2);
    expect(body.dues_card.outstanding_dues).toBe(8000);
    expect(body.credit_card.available_credit).toBe(42000);
    expect(body.latest_promotions_preview[0].name).toBe('June Promo');
    expect(body.order_again_preview[0].display_name).toBe('Bullet Camera');
    expect(body.recent_activity.items).toHaveLength(1);
  });
});
