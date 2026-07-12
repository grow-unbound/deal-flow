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

  order() {
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

  then(resolve: (value: { data: unknown[]; error: null; count: number | null }) => unknown) {
    const payload = this.table === 'tenant_products'
      ? this.productPayload()
      : this.table === 'tenant_brands'
        ? this.brandPayload()
        : this.categoryPayload();
    return Promise.resolve(resolve({ ...payload, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => new ProductComposerQueryBuilder(table)),
    })),
  },
}));

import { GET as getProductComposer } from '../../app/api/tenant/products/composer/route';

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
    if (this.table === 'buyers_snapshot') {
      return Promise.resolve(resolve({
        data: [
          { buyer_id: '66666666-6666-4666-8666-666666666666', last_order_at: '2026-07-02T00:00:00.000Z', outstanding_dues: 1000 },
          { buyer_id: '77777777-7777-4777-8777-777777777777', last_order_at: '2026-07-03T00:00:00.000Z', outstanding_dues: 2000 },
        ],
        error: null,
        count: null,
      }));
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

  it('searches cohort composer buyers tenant-wide before applying the page limit', async () => {
    const db = {
      schema: () => ({
        from: (table: string) => new BuyerResultsetQueryBuilder(table),
      }),
    };

    const result = await getCohortComposerBuyerResultset(db, 'tenant-1', { q: 'Hidden', limit: 1 });

    expect(result.buyers.map((buyer) => buyer.business_name)).toEqual(['Hidden Retail']);
    expect(result.total).toBe(1);
    expect(result.nextCursor).toBeNull();
  });
});
