import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getCohortComposerBuyerResultset } from '@/lib/server/cohort-composer';

const getVerifiedClaimsMock = vi.fn();

const PRODUCT_BRAND_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

const productRows = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    internal_sku: 'SKU-001',
    name_override: 'Alpha Reserve',
    tenant_brand_id: PRODUCT_BRAND_ID,
    tenant_category_id: PRODUCT_CATEGORY_ID,
    mrp: 1000,
    base_selling_price: 760,
    cost_price: 500,
    is_active: true,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    internal_sku: 'SKU-002',
    name_override: 'Beta Blanc',
    tenant_brand_id: PRODUCT_BRAND_ID,
    tenant_category_id: PRODUCT_CATEGORY_ID,
    mrp: 900,
    base_selling_price: 680,
    cost_price: 450,
    is_active: true,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    internal_sku: 'SKU-HIDDEN',
    name_override: 'Hidden Merlot',
    tenant_brand_id: PRODUCT_BRAND_ID,
    tenant_category_id: PRODUCT_CATEGORY_ID,
    mrp: 1200,
    base_selling_price: 880,
    cost_price: 640,
    is_active: true,
  },
];

class ProductComposerQueryBuilder {
  private selected = '';
  private countExact = false;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  private inFilters = new Map<string, string[]>();
  private ilikeFilters = new Map<string, string>();
  private orClause = '';

  constructor(private table: string) {}

  select(columns: string, options?: { count?: string }) {
    this.selected = columns;
    this.countExact = options?.count === 'exact';
    return this;
  }

  eq() {
    return this;
  }

  is() {
    return this;
  }

  not() {
    return this;
  }

  neq() {
    return this;
  }

  gte() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  in(column: string, values: string[]) {
    this.inFilters.set(column, values);
    return this;
  }

  ilike(column: string, pattern: string) {
    this.ilikeFilters.set(column, pattern.replaceAll('%', '').toLowerCase());
    return this;
  }

  or(clause: string) {
    this.orClause = clause;
    return this;
  }

  private productPayload() {
    let rows = [...productRows];
    const brandIds = this.inFilters.get('tenant_brand_id');
    const categoryIds = this.inFilters.get('tenant_category_id');
    if (brandIds) rows = rows.filter((row) => brandIds.includes(row.tenant_brand_id));
    if (categoryIds) rows = rows.filter((row) => categoryIds.includes(row.tenant_category_id));

    if (this.orClause) {
      const search = this.orClause.match(/ilike\.%([^%]+)%/)?.[1]?.toLowerCase() ?? '';
      rows = rows.filter((row) =>
        row.internal_sku.toLowerCase().includes(search)
        || row.name_override.toLowerCase().includes(search),
      );
    }

    const count = rows.length;
    if (this.selected === 'tenant_brand_id') {
      return { data: rows.map((row) => ({ tenant_brand_id: row.tenant_brand_id })), count: null };
    }
    if (this.selected === 'tenant_category_id') {
      return { data: rows.map((row) => ({ tenant_category_id: row.tenant_category_id })), count: null };
    }
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      rows = rows.slice(this.rangeStart, this.rangeEnd + 1);
    }
    return { data: rows, count: this.countExact ? count : null };
  }

  private brandPayload() {
    const rows = [{ id: PRODUCT_BRAND_ID, display_name_override: 'Solar Estates' }];
    const search = this.ilikeFilters.get('display_name_override');
    const ids = this.inFilters.get('id');
    return {
      data: rows.filter((row) => (!search || row.display_name_override.toLowerCase().includes(search)) && (!ids || ids.includes(row.id))),
      count: null,
    };
  }

  private categoryPayload() {
    const rows = [{ id: PRODUCT_CATEGORY_ID, name: 'Red wine' }];
    const ids = this.inFilters.get('id');
    return { data: rows.filter((row) => !ids || ids.includes(row.id)), count: null };
  }

  private inventoryPayload() {
    const productIds = this.inFilters.get('tenant_product_id');
    return {
      data: productRows
        .filter((row) => !productIds || productIds.includes(row.id))
        .map((row) => ({
          tenant_product_id: row.id,
          qty_available: 12,
          reorder_point: 4,
          updated_at: '2026-07-14T08:00:00.000Z',
        })),
      count: null,
    };
  }

  private ordersPayload() {
    return { data: [{ id: '88888888-8888-4888-8888-888888888888', placed_at: '2026-07-10T00:00:00.000Z' }], count: null };
  }

  private orderItemsPayload() {
    const productIds = this.inFilters.get('tenant_product_id');
    return {
      data: productRows
        .filter((row) => !productIds || productIds.includes(row.id))
        .map((row) => ({ order_id: '88888888-8888-4888-8888-888888888888', tenant_product_id: row.id, qty: 2 })),
      count: null,
    };
  }

  then(resolve: (value: { data: unknown[]; error: null; count: number | null }) => unknown) {
    const payload = this.table === 'tenant_products'
      ? this.productPayload()
      : this.table === 'tenant_brands'
        ? this.brandPayload()
        : this.table === 'tenant_categories'
          ? this.categoryPayload()
          : this.table === 'tenant_inventory'
            ? this.inventoryPayload()
            : this.table === 'orders'
              ? this.ordersPayload()
              : this.orderItemsPayload();
    return Promise.resolve(resolve({ ...payload, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        if (fn === 'get_product_composer_facets') {
          return Promise.resolve({
            data: [
              { facet_type: 'brand', facet_id: PRODUCT_BRAND_ID, facet_label: 'Solar Estates', product_count: 3 },
              { facet_type: 'category', facet_id: PRODUCT_CATEGORY_ID, facet_label: 'Red wine', product_count: 3 },
            ],
            error: null,
          });
        }
        if (fn === 'get_catalog_composer_product_metrics') {
          const ids = Array.isArray(args.p_product_ids) ? args.p_product_ids as string[] : [];
          return Promise.resolve({
            data: ids.map((id) => ({
              tenant_product_id: id,
              qty_available: 12,
              reorder_point: 4,
              inventory_updated_at: '2026-07-14T08:00:00.000Z',
              units_mtd: 2,
              has_recent_order: true,
            })),
            error: null,
          });
        }
        if (fn !== 'search_products_scoped') {
          return Promise.resolve({ data: null, error: null });
        }

        let rows = [...productRows];
        const ids = Array.isArray(args.p_ids) ? args.p_ids as string[] : [];
        const brandIds = Array.isArray(args.p_brand_ids) ? args.p_brand_ids as string[] : [];
        const categoryIds = Array.isArray(args.p_category_ids) ? args.p_category_ids as string[] : [];
        const availability = String(args.p_availability ?? 'show_all');
        const query = typeof args.p_query === 'string' ? args.p_query.trim().toLowerCase() : '';
        const limit = Math.max(1, Number(args.p_limit ?? 20));
        const offset = Math.max(0, Number(args.p_offset ?? 0));

        if (ids.length > 0) rows = rows.filter((row) => ids.includes(row.id));
        if (brandIds.length > 0) rows = rows.filter((row) => brandIds.includes(row.tenant_brand_id));
        if (categoryIds.length > 0) rows = rows.filter((row) => categoryIds.includes(row.tenant_category_id));
        if (query) {
          rows = rows.filter((row) =>
            row.internal_sku.toLowerCase().includes(query)
            || row.name_override.toLowerCase().includes(query),
          );
        }
        if (availability !== 'show_all' && availability !== 'show_everything') {
          rows = [];
        }

        const totalCount = rows.length;
        rows = rows.slice(offset, offset + limit);

        return Promise.resolve({
          data: rows.map((row) => ({
            tenant_product_id: row.id,
            product_name: row.name_override,
            sku: row.internal_sku,
            brand_id: row.tenant_brand_id,
            brand_name: 'Solar Estates',
            category_id: row.tenant_category_id,
            category_name: 'Red wine',
            hsn_code: null,
            tax_pct: null,
            on_hand: 0,
            reorder_point: 0,
            unit_price: row.base_selling_price,
            mrp: row.mrp,
            base_selling_price: row.base_selling_price,
            cost_price: row.cost_price,
            default_uom: null,
            pack_size: null,
            created_at: '2026-07-01T00:00:00.000Z',
            search_rank: query ? 1 : 0,
            total_count: totalCount,
          })),
          error: null,
        });
      }),
      from: vi.fn((table: string) => new ProductComposerQueryBuilder(table)),
    })),
  },
}));

import { GET as getProductComposer } from '../../app/api/tenant/products/composer/route';
import { GET as getCatalogProductComposer } from '../../app/api/tenant/catalogs/composer/products/route';

class BuyerResultsetQueryBuilder {
  private selected = '';
  private countExact = false;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  private orClause = '';

  constructor(private table: string) {}

  select(columns: string, options?: { count?: string }) {
    this.selected = columns;
    this.countExact = options?.count === 'exact';
    return this;
  }

  eq() {
    return this;
  }

  is() {
    return this;
  }

  order() {
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  gte() {
    return this;
  }

  in() {
    return this;
  }

  or(clause: string) {
    this.orClause = clause;
    return this;
  }

  private buyersPayload() {
    let rows = [
      {
        id: '66666666-6666-4666-8666-666666666666',
        business_name: 'Alpha Stores',
        contact_name: 'Asha',
        geography: { city: 'Delhi', state: 'DL' },
        tier: 'A',
        payment_terms_days: 21,
        credit_limit: 100000,
        external_ref: 'B-001',
      },
      {
        id: '77777777-7777-4777-8777-777777777777',
        business_name: 'Hidden Retail',
        contact_name: 'Ravi',
        geography: { city: 'Mumbai', state: 'MH' },
        tier: 'B',
        payment_terms_days: 14,
        credit_limit: 80000,
        external_ref: 'B-HIDDEN',
      },
    ];
    if (this.orClause) {
      const search = this.orClause.match(/ilike\.%([^%]+)%/)?.[1]?.toLowerCase() ?? '';
      rows = rows.filter((row) =>
        row.business_name.toLowerCase().includes(search)
        || row.contact_name.toLowerCase().includes(search)
        || row.external_ref.toLowerCase().includes(search),
      );
    }
    const count = rows.length;
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      rows = rows.slice(this.rangeStart, this.rangeEnd + 1);
    }
    return { data: rows, count: this.countExact ? count : null };
  }

  then(resolve: (value: { data: unknown[]; error: null; count: number | null }) => unknown) {
    if (this.table === 'buyers') {
      return Promise.resolve(resolve({ ...this.buyersPayload(), error: null }));
    }
    return Promise.resolve(resolve({
      data: [
        { buyer_id: '66666666-6666-4666-8666-666666666666', orders_gmv: 1000, orders_count: 1, day: '2026-07-04' },
        { buyer_id: '77777777-7777-4777-8777-777777777777', orders_gmv: 2000, orders_count: 2, day: '2026-07-04' },
      ],
      error: null,
      count: null,
    }));
  }
}

describe('composer resultset APIs', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
  });

  it('rejects buyer roles from the seller product composer', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'buyer_admin' });

    const response = await getProductComposer(new NextRequest('http://localhost/api/tenant/products/composer'));

    expect(response.status).toBe(403);
  });

  it('searches products tenant-wide before applying the composer page limit', async () => {
    const response = await getProductComposer(new NextRequest('http://localhost/api/tenant/products/composer?q=Hidden&limit=1&selected_id=33333333-3333-4333-8333-333333333333'));
    const body = await response.json() as {
      products: Array<{ id: string; display_name: string }>;
      selected_products: Array<{ id: string; display_name: string }>;
      total: number;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.products).toHaveLength(1);
    expect(body.products[0]).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      display_name: 'Hidden Merlot',
    });
    expect(body.total).toBe(1);
    expect(body.nextCursor).toBeNull();
    expect(body.selected_products).toEqual([
      expect.objectContaining({
        id: '33333333-3333-4333-8333-333333333333',
        display_name: 'Alpha Reserve',
      }),
    ]);
  });

  it('searches catalog products tenant-wide before hydrating the composer page', async () => {
    const response = await getCatalogProductComposer(new NextRequest('http://localhost/api/tenant/catalogs/composer/products?q=Hidden&limit=1'));
    const body = await response.json() as {
      products: Array<{ id: string; display_name: string; qty_available: number; cost_price: number | null }>;
      total: number;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.products).toEqual([
      expect.objectContaining({
        id: '55555555-5555-4555-8555-555555555555',
        display_name: 'Hidden Merlot',
        qty_available: 12,
        cost_price: 640,
      }),
    ]);
    expect(body.total).toBe(1);
    expect(body.nextCursor).toBeNull();
  });

  it('searches cohort composer buyers tenant-wide before applying the page limit', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        buyer_id: '77777777-7777-4777-8777-777777777777',
        business_name: 'Hidden Retail',
        contact_name: 'Ravi',
        external_ref: 'B-HIDDEN',
        geography: { city: 'Mumbai', state: 'MH' },
        tier: 'B',
        payment_terms_days: 14,
        last_order_at: '2026-07-03T00:00:00.000Z',
        outstanding_dues: 2000,
        gmv_90d: 2000,
        mtd_spend: 2000,
        orders_mtd: 2,
        total_count: 1,
      }],
      error: null,
    });
    const db = {
      schema: () => ({
        from: (table: string) => new BuyerResultsetQueryBuilder(table),
        rpc,
      }),
    };

    const result = await getCohortComposerBuyerResultset(db, 'tenant-1', { q: 'Hidden', limit: 1 });

    expect(rpc).toHaveBeenCalledWith('search_cohort_composer_buyers', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_query: 'Hidden',
      p_limit: 1,
      p_offset: 0,
    }));
    expect(result.buyers.map((buyer) => buyer.business_name)).toEqual(['Hidden Retail']);
    expect(result.total).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it('maps buyer_app_enabled and overdue_amount, and passes p_ids through for a selected-buyer lookup', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        buyer_id: '88888888-8888-4888-8888-888888888888',
        business_name: 'Overdue Traders',
        contact_name: null,
        external_ref: 'B-OVERDUE',
        geography: { city: 'Pune', state: 'MH' },
        tier: 'A',
        payment_terms_days: 30,
        last_order_at: '2026-06-01T00:00:00.000Z',
        outstanding_dues: 5000,
        gmv_90d: 12000,
        mtd_spend: 0,
        orders_mtd: 0,
        total_count: 1,
        buyer_app_enabled: true,
        overdue_amount: 5000,
      }],
      error: null,
    });
    const db = {
      schema: () => ({
        from: (table: string) => new BuyerResultsetQueryBuilder(table),
        rpc,
      }),
    };

    const result = await getCohortComposerBuyerResultset(db, 'tenant-1', {
      ids: ['88888888-8888-4888-8888-888888888888'],
    });

    expect(rpc).toHaveBeenCalledWith('search_cohort_composer_buyers', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_ids: ['88888888-8888-4888-8888-888888888888'],
    }));
    expect(result.buyers[0]).toMatchObject({
      buyer_app_enabled: true,
      overdue_amount: 5000,
    });
    expect(result.nextCursor).toBeNull();
  });

  it('hard-caps the ids option at 250 before it reaches the RPC (never an unbounded id list)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const db = {
      schema: () => ({
        from: (table: string) => new BuyerResultsetQueryBuilder(table),
        rpc,
      }),
    };
    const hugeIdList = Array.from({ length: 500 }, (_, i) => `id-${i}`);

    await getCohortComposerBuyerResultset(db, 'tenant-1', { ids: hugeIdList });

    const calledArgs = rpc.mock.calls[0][1] as { p_ids: string[] };
    expect(calledArgs.p_ids).toHaveLength(250);
  });
});
