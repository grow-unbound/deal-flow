import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const brandInFilters: unknown[] = [];
const metricsRpcCalls: Array<Record<string, unknown>> = [];
const queriedTables: string[] = [];

const dataState = {
  campaigns: [
    {
      id: 'campaign-1',
      name: 'Weekend Push',
      scope_type: 'all',
      scope_value: {},
      valid_from: '2026-07-01T00:00:00.000Z',
      valid_to: '2026-07-20T00:00:00.000Z',
      status: 'published',
      created_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'campaign-2',
      name: 'Dormant Reactivation',
      scope_type: 'all',
      scope_value: {},
      valid_from: '2026-07-02T00:00:00.000Z',
      valid_to: null,
      status: 'published',
      created_at: '2026-07-02T00:00:00.000Z',
    },
  ],
};

class QueryBuilder {
  table: string;
  schemaName: string;
  filters: Record<string, unknown> = {};

  constructor(schemaName: string, table: string) {
    this.schemaName = schemaName;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  in(column: string, value: unknown) {
    this.filters[column] = value;
    if (this.schemaName === 'catalog' && this.table === 'brands' && column === 'id') {
      brandInFilters.push(value);
    }
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

  limit() {
    return this;
  }

  gte() {
    return this;
  }

  lt() {
    return this;
  }

  or() {
    return this;
  }

  then(resolve: (value: { data: unknown; error: null; count?: number }) => unknown) {
    if (this.table === 'campaigns') {
      const ids = this.filters.id as string[] | undefined;
      return Promise.resolve(resolve({ data: ids ? dataState.campaigns.filter((row) => ids.includes(row.id)) : dataState.campaigns, error: null }));
    }

    if (this.table === 'campaign_items') {
      return Promise.resolve(
        resolve({
          data: [
            { campaign_id: 'campaign-1', tenant_product_id: 'product-1' },
            { campaign_id: 'campaign-2', tenant_product_id: 'product-2' },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'tenant_products') {
      return Promise.resolve(
        resolve({
          data: [
            { id: 'product-1', tenant_brand_id: 'tenant-brand-1' },
            { id: 'product-2', tenant_brand_id: 'tenant-brand-2' },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'tenant_brands') {
      return Promise.resolve(
        resolve({
          data: [
            { id: 'tenant-brand-1', display_name_override: 'House Brand', master_brand_id: null },
            { id: 'tenant-brand-2', display_name_override: 'Field Brand', master_brand_id: null },
          ],
          error: null,
        }),
      );
    }

    if (this.schemaName === 'catalog' && this.table === 'brands') {
      return Promise.resolve(resolve({ data: [], error: null }));
    }

    if (this.table === 'orders') {
      return Promise.resolve(
        resolve({
          data: [
            {
              id: 'order-1',
              campaign_id: 'campaign-1',
              total_amount: 1200,
              order_date: '2026-07-05T00:00:00.000Z',
              placed_at: null,
              created_at: '2026-06-01T00:00:00.000Z',
              status: 'confirmed',
              buyer_id: 'buyer-1',
            },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'estimates') {
      return Promise.resolve(
        resolve({
          data: [
            {
              id: 'estimate-1',
              campaign_id: 'campaign-2',
              total_amount: 800,
              status: 'sent',
              converted_to_order_id: null,
              estimate_date: '2026-07-06T00:00:00.000Z',
              created_at: '2026-06-01T00:00:00.000Z',
              buyer_id: 'buyer-2',
            },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'campaign_views') {
      return Promise.resolve(
        resolve({
          data: [
            { campaign_id: 'campaign-1', buyer_id: 'buyer-1', viewed_at: '2026-07-05T01:00:00.000Z' },
            { campaign_id: 'campaign-2', buyer_id: 'buyer-2', viewed_at: '2026-07-06T01:00:00.000Z' },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'cohorts') {
      return Promise.resolve(resolve({ data: [], error: null }));
    }

    if (this.table === 'buyers') {
      return Promise.resolve(resolve({ data: [], error: null, count: 12 }));
    }

    if (this.table === 'order_items') {
      return Promise.resolve(
        resolve({
          data: [{ order_id: 'order-1', tenant_product_id: 'product-1', qty: 1, line_total: 1200, unit_price: 1200 }],
          error: null,
        }),
      );
    }

    if (this.table === 'estimate_items') {
      return Promise.resolve(
        resolve({
          data: [{ estimate_id: 'estimate-1', tenant_product_id: 'product-2', qty: 1, line_total: 800, unit_price: 800 }],
          error: null,
        }),
      );
    }

    return Promise.resolve(resolve({ data: [], error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => ({
      from: vi.fn((table: string) => {
        queriedTables.push(`${schemaName}.${table}`);
        return new QueryBuilder(schemaName, table);
      }),
      rpc: vi.fn((_name: string, params: Record<string, unknown>) => {
        metricsRpcCalls.push(params);
        return Promise.resolve({
          data: {
            row_metrics: {
              'campaign-1': { gmv: 1200, previous_gmv: 0, order_count: 1, estimate_count: 0, conversions: 1, views: 1, view_pct: 8.3, conversion_pct: 100, growth_pct: 100, products_count: 6, brands_count: 2, audience_label: 'All buyers', audience_count: 12 },
              'campaign-2': { gmv: 800, previous_gmv: 0, order_count: 0, estimate_count: 1, conversions: 1, views: 1, view_pct: 8.3, conversion_pct: 100, growth_pct: 100, products_count: 4, brands_count: 1, audience_label: 'All buyers', audience_count: 12 },
            },
            summary: params.p_include_summary ? {
              kpis: { live_catalogs: 2, draft_catalogs: 0, ended_catalogs: 0, expiring7d: 1, gmv_mtd: 2000, gmv_prev_mtd: 0, gmv_growth_pct: 100, avg_conversion_pct: 100, orders_attributed_mtd: 2, conversions_mtd: 2 },
              todays_read: { needs_attention: [], top_performers: [], top_risers: [] },
            } : null,
          },
          error: null,
        });
      }),
    })),
  },
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: vi.fn().mockResolvedValue({
    create_sales_orders: true,
    create_enquiries: true,
  }),
}));

vi.mock('@/lib/server/seller-landing-entity-search', () => ({
  searchSellerLandingEntityIds: vi.fn((params: { limit: number; offset: number }) => Promise.resolve({
    ids: ['campaign-1', 'campaign-2'].slice(params.offset, params.offset + params.limit),
    total: 2,
  })),
}));

import { GET } from '../../app/api/tenant/catalogs/route';

describe('GET /api/tenant/catalogs', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    brandInFilters.length = 0;
    metricsRpcCalls.length = 0;
    queriedTables.length = 0;
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
  });

  it('hydrates unique opener and demand-customer metrics for landing rows and KPIs', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/catalogs?period=month'));
    const body = (await response.json()) as {
      catalogs?: Array<{
        id: string;
        products_count: number;
        brands_count: number;
        cohort_name: string;
        audience_count: number;
        demand_customers: number;
        conversion_pct: number;
      }>;
      kpis?: {
        opened_customers_mtd: number;
        conversions_mtd: number;
        avg_conversion_pct: number;
      };
      error?: string;
    };

    expect(response.status).toBe(200);
    expect(body.catalogs).toHaveLength(2);
    expect(body.catalogs?.[0]).toMatchObject({
      id: 'campaign-1',
      products_count: 6,
      brands_count: 2,
      cohort_name: 'All buyers',
      audience_count: 12,
      demand_customers: 1,
      conversion_pct: 100,
    });
    expect(body.kpis).toMatchObject({
      opened_customers_mtd: 2,
      conversions_mtd: 2,
      avg_conversion_pct: 100,
    });
    expect(queriedTables).toEqual([
      'app.campaigns',
      'app.campaign_items',
      'app.orders',
      'app.estimates',
      'app.campaign_views',
      'app.order_items',
      'app.estimate_items',
    ]);
    expect(brandInFilters).toHaveLength(0);
  });

  it('rejects seller assistants from the grow catalogs surface', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_assistant' });

    const response = await GET(new NextRequest('http://localhost/api/tenant/catalogs'));

    expect(response.status).toBe(403);
  });

  it('keeps KPI math invariant when the table row limit changes', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/catalogs?limit=1&period=month'));
    const body = (await response.json()) as {
      kpis: { live_catalogs: number; gmv_mtd: number };
      catalogs: Array<{ id: string }>;
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body.kpis.live_catalogs).toBe(2);
    expect(body.kpis.gmv_mtd).toBe(2000);
    expect(body.catalogs).toHaveLength(1);
    expect(body.total).toBe(2);
  });

  it('hydrates only current-page campaign IDs and skips summary after page zero', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/catalogs?limit=1&offset=1&include_summary=false&period=month'));
    const body = (await response.json()) as { catalogs: Array<{ id: string }>; kpis?: unknown };

    expect(response.status).toBe(200);
    expect(body.catalogs.map((row) => row.id)).toEqual(['campaign-2']);
    expect(body.kpis).toBeUndefined();
    expect(metricsRpcCalls.find((call) => Array.isArray(call.p_campaign_ids))).toMatchObject({
      p_campaign_ids: ['campaign-2'],
      p_include_summary: false,
    });
  });
});
