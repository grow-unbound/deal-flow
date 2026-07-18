import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

type QueryResult = { data?: unknown; error?: unknown };
const dbResponses: Record<string, QueryResult> = {};
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
const fromCalls: string[] = [];
const inCalls: Array<[string, string, unknown[]]> = [];

function createQuery(key: string) {
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      return query;
    }),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    maybeSingle: vi.fn(),
    limit: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = dbResponses[key] ?? {};
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.is.mockReturnValue(query);
  query.in.mockImplementation((column: string, values: unknown[]) => {
    inCalls.push([key, column, values]);
    return query;
  });
  query.order.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => {
    const key = `${schemaName}.${tableName}`;
    fromCalls.push(key);
    return { select: vi.fn(() => createQuery(key)) };
  }),
  rpc: vi.fn((functionName: string, args: Record<string, unknown>) => {
    rpcCalls.push([functionName, args]);
    const result = dbResponses[`${schemaName}.rpc.${functionName}`] ?? {};
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: (...args: unknown[]) => schemaMock(...args) },
}));

import { GET } from '../../app/api/tenant/categories/landing/route';

describe('GET /api/tenant/categories/landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    fromCalls.length = 0;
    inCalls.length = 0;
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.tenant_categories'] = {
      data: [
        { id: 'cat-1', name: 'Cables', slug: 'cables', is_active: true, deleted_at: null, created_at: '2026-07-01T00:00:00.000Z' },
      ],
    };
    dbResponses['app.rpc.search_seller_category_landing_ids'] = {
      data: [{ id: 'cat-1', total_count: 1 }],
    };
    dbResponses['app.rpc.get_seller_category_landing_page_metrics_v2'] = {
      data: [{
        tenant_category_id: 'cat-1',
        active_sku_count: 1,
        oos_sku_count: 0,
        low_stock_sku_count: 0,
        brand_count: 1,
        gmv_current: 1200,
        gmv_previous: 1000,
        units_current: 4,
        buyers_current: 2,
        avg_days_cover: null,
      }],
    };
    dbResponses['app.rpc.get_seller_category_landing_summary_v2'] = {
      data: {
        kpis: {
          active_count: 1,
          low_stock_count: 0,
          top_category_name: 'Cables',
          top_category_share_pct: 100,
          uncategorized_count: 0,
        },
        callouts: {
          stockout_risk: [],
          top_performers: [{ id: 'cat-1', name: 'Cables', gmv_mtd: 1200, growth_pct: 20, buyers_count: 2 }],
          fast_movers: [{ id: 'cat-1', name: 'Cables', units_mtd: 4, growth_pct: 20 }],
        },
      },
    };
  });

  it('returns 403 for seller_assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    expect(response.status).toBe(403);
  });

  it('returns null avg_days_cover when no recent invoice velocity exists', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].avg_days_cover).toBeNull();
  });

  it('hydrates only selected category rows and uses compact SQL metrics', async () => {
    await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));

    expect(inCalls).toContainEqual(['app.tenant_categories', 'id', ['cat-1']]);
    expect(rpcCalls).toContainEqual(['get_seller_category_landing_page_metrics_v2', expect.objectContaining({
      p_tenant_id: 'tenant-1',
      p_category_ids: ['cat-1'],
    })]);
    expect(fromCalls).not.toContain('app.tenant_inventory');
    expect(fromCalls).not.toContain('app.kpi_product_daily');
    expect(fromCalls).not.toContain('app.kpi_category_daily');
    expect(fromCalls).not.toContain('app.categories_snapshot');
  });

  it('uses the category search vector and limits rows before hydration', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?search=cables&limit=20'));

    expect(response.status).toBe(200);
    expect(rpcCalls).toContainEqual(['search_seller_category_landing_ids', expect.objectContaining({
      p_query: 'cables',
      p_limit: 20,
    })]);
  });

  it('skips tenant-wide summary work on later pages', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/tenant/categories/landing?period=month&offset=50&include_summary=false',
    ));

    expect(response.status).toBe(200);
    expect(rpcCalls.some(([name]) => name === 'get_seller_category_landing_summary_v2')).toBe(false);
    expect(rpcCalls.some(([name]) => name === 'get_seller_category_landing_page_metrics_v2')).toBe(true);
  });

  it('preserves compact summary and callout response fields', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    const body = await response.json();

    expect(body.kpis).toEqual(expect.objectContaining({
      active_count: 1,
      top_category_name: 'Cables',
      top_category_share_pct: 100,
    }));
    expect(body.callouts.top_performers[0]).toEqual(expect.objectContaining({
      id: 'cat-1',
      initials: 'C',
      gmv_mtd: 1200,
    }));
    expect(body.rows[0]).toEqual(expect.objectContaining({
      active_sku_count: 1,
      gmv_mtd: 1200,
      growth_pct: 20,
    }));
  });
});
