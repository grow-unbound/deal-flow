import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getCatalogComposerPayloadMock = vi.fn();
const getInAppCreateFlagsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/catalog-composer', () => ({
  getCatalogComposerPayload: (...args: unknown[]) => getCatalogComposerPayloadMock(...args),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: (...args: unknown[]) => getInAppCreateFlagsMock(...args),
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogClient: vi.fn(),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

const dbResponses: Record<string, QueryResult[]> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    neq: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null };
  });
  query.single.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null };
  });

  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/catalogs/[id]/route';

describe('catalog detail api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getCatalogComposerPayloadMock.mockResolvedValue({
      products: [
        {
          id: 'tp-1',
          display_name: 'Cabernet Reserve',
          internal_sku: 'SKU-1',
          brand_name: 'WineYard',
          stock_label: 'In stock',
          stock_tone: 'success',
          mrp: 1200,
          base_selling_price: 1000,
          units_mtd: 0,
          days_cover: null,
          tag: null,
        },
      ],
    });
    getInAppCreateFlagsMock.mockResolvedValue({
      create_sales_orders: true,
      create_enquiries: true,
    });

    dbResponses['app.campaigns'] = [
      { data: { id: 'catalog-1', tenant_id: 'tenant-1' } },
      {
        data: {
          id: 'catalog-1',
          tenant_id: 'tenant-1',
          name: 'July Push',
          scope_type: 'buyer',
          scope_value: { buyer_ids: ['buyer-1'] },
          valid_from: '2026-07-05T00:00:00Z',
          valid_to: '2026-07-31T00:00:00Z',
          status: 'published',
          share_token: 'share-1',
          message: null,
          created_by: 'user-1',
          created_at: '2026-07-01T00:00:00Z',
        },
      },
      { data: { id: 'catalog-0', valid_from: '2026-06-01T00:00:00Z' } },
    ];
    dbResponses['app.campaign_items'] = [
      {
        data: [
          {
            id: 'item-1',
            tenant_product_id: 'tp-1',
            price_override: null,
            display_order: 1,
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
      },
      {
        data: [{ tenant_product_id: 'tp-1' }],
      },
    ];
    dbResponses['app.orders'] = [
      {
        data: [
          {
            id: 'order-1',
            buyer_id: 'buyer-1',
            total_amount: 1000,
            placed_at: '2026-07-04T20:00:00Z',
            order_date: '2026-07-05',
            status: 'received',
            created_at: '2026-07-04T20:00:00Z',
          },
        ],
      },
      {
        data: [
          {
            id: 'prev-order-1',
            buyer_id: 'buyer-1',
            total_amount: 800,
            placed_at: '2026-06-01T20:00:00Z',
            order_date: '2026-06-02',
            status: 'received',
            created_at: '2026-06-01T20:00:00Z',
          },
        ],
      },
    ];
    dbResponses['app.estimates'] = [
      {
        data: [
          {
            id: 'estimate-1',
            buyer_id: 'buyer-1',
            total_amount: 500,
            status: 'accepted',
            converted_to_order_id: null,
            estimate_date: '2026-07-06',
            created_at: '2026-07-05T20:00:00Z',
          },
        ],
      },
      {
        data: [],
      },
    ];
    dbResponses['app.campaign_views'] = [
      {
        data: [
          { buyer_id: 'buyer-1', campaign_id: 'catalog-1', viewed_at: '2026-07-04T06:00:00Z', view_date: '2026-07-04' },
        ],
      },
    ];
    dbResponses['app.buyers'] = [
      {
        data: [{ id: 'buyer-1', business_name: 'Alpha Retail', geography: { city: 'Mumbai' }, tier: 'A' }],
      },
    ];
    dbResponses['app.order_items'] = [
      {
        data: [{ order_id: 'order-1', tenant_product_id: 'tp-1', qty: 1, line_total: 1000, unit_price: 1000 }],
      },
      {
        data: [{ order_id: 'prev-order-1', tenant_product_id: 'tp-1', qty: 1, line_total: 800, unit_price: 800 }],
      },
    ];
    dbResponses['app.estimate_items'] = [
      {
        data: [{ estimate_id: 'estimate-1', tenant_product_id: 'tp-1', qty: 1, line_total: 500, unit_price: 500 }],
      },
      {
        data: [],
      },
    ];
  });

  it('uses canonical order and estimate dates in daily performance rollups', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/catalogs/catalog-1'),
      { params: Promise.resolve({ id: 'catalog-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.performance.daily).toEqual([
      expect.objectContaining({ date: '2026-07-05', revenue: 1000 }),
      expect.objectContaining({ date: '2026-07-06', revenue: 500 }),
    ]);
    expect(body.performance.summary.published_at_label).toBe(
      new Date('2026-07-05T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    );
  });
});
