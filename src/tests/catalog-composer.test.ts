import { describe, expect, it, vi } from 'vitest';

import { getCatalogComposerPayload } from '@/lib/server/catalog-composer';

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number;
};

const dbResponses: Record<string, QueryResult[]> = {};
const schemaCalls: string[] = [];

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query: Record<string, unknown> = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    neq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown; count?: number }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(
        onFulfilled({
          data: result.data ?? null,
          error: result.error ?? null,
          count: result.count,
        }),
      );
    },
  };

  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.lt = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => query);
  return query;
}

const db = {
  schema: (schemaName: string) => {
    schemaCalls.push(schemaName);
    return {
      from: (tableName: string) => ({
        select: () => createQuery(`${schemaName}.${tableName}`),
      }),
    };
  },
};

describe('getCatalogComposerPayload', () => {
  it('stays within app schema and ignores malformed master brand ids', async () => {
    schemaCalls.length = 0;
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    dbResponses['app.tenant_products'] = [
      {
        data: [
          {
            id: 'product-1',
            internal_sku: 'SKU-001',
            name_override: null,
            tenant_brand_id: 'brand-1',
            tenant_category_id: 'category-1',
            mrp: 1000,
            base_selling_price: 750,
            cost_price: 500,
            created_at: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
    ];
    dbResponses['app.cohorts'] = [{ data: [] }];
    dbResponses['app.orders'] = [{ data: [] }, { data: [] }, { data: [] }];
    dbResponses['app.buyers'] = [{ count: 1 }, { data: [{ id: 'buyer-1', business_name: 'Bharat Stores', contact_name: null, external_ref: null, tier: null, geography: null, credit_limit: null, payment_terms_days: null }] }];
    dbResponses['app.price_lists'] = [{ data: [] }];
    dbResponses['app.cohort_members'] = [{ data: [] }];
    dbResponses['app.order_items'] = [{ data: [] }];
    dbResponses['app.tenant_inventory'] = [{ data: [{ tenant_product_id: 'product-1', qty_available: 8, reorder_point: 4, updated_at: '2026-07-06T00:00:00.000Z' }] }];
    dbResponses['app.tenant_categories'] = [{ data: [{ id: 'category-1', name: 'Snacks' }] }];
    dbResponses['app.tenant_brands'] = [{ data: [{ id: 'brand-1', display_name_override: 'Solar Estates', master_brand_id: 'null' }] }];
    dbResponses['app.price_list_items'] = [{ data: [] }];

    const payload = await getCatalogComposerPayload(db as never, 'tenant-1', 'seller_admin');

    expect(schemaCalls).not.toContain('catalog');
    expect(payload.products).toEqual([
      expect.objectContaining({
        id: 'product-1',
        display_name: 'SKU-001',
        brand_name: 'Solar Estates',
        category_name: 'Snacks',
        qty_available: 8,
      }),
    ]);
    expect(payload.buyer_count).toBe(1);
    expect(payload.can_view_cost).toBe(true);
  });
});
