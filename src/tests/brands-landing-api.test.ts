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

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

const dbResponses: Record<string, QueryResult[]> = {};
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
const tableCalls: string[] = [];

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
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    neq: vi.fn(),
    not: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => {
    tableCalls.push(`${schemaName}.${tableName}`);
    return { select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)) };
  }),
  rpc: vi.fn((functionName: string, args: Record<string, unknown>) => {
    rpcCalls.push([functionName, args]);
    const result = nextResult(`${schemaName}.rpc.${functionName}`);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/brands/route';

describe('brands landing api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    tableCalls.length = 0;
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.rpc.search_seller_brand_landing_page'] = [{ data: [{ id: 'brand-1', total_count: 1 }] }];
    dbResponses['app.rpc.get_seller_brand_landing_rows'] = [{
      data: [{
        id: 'brand-1',
        row_data: {
          id: 'brand-1',
          tenant_id: 'tenant-1',
          master_brand_id: null,
          display_name_override: 'Alpha',
          slug: null,
          description: null,
          logo_url: null,
          margin_pct: null,
          exclusivity: false,
          is_active: true,
          external_ref: null,
          principal_name: null,
          principal_email: null,
          principal_phone: null,
          principal_location: null,
          contact_name: null,
          contact_email: null,
          contact_phone: null,
          default_cohort_id: 'cohort-1',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          master_brand: null,
          gmv_mtd: 100,
          gmv_prev_mtd: 80,
          growth_pct: 25,
          portfolio_share_pct: 100,
          sku_count: 2,
          active_buyers_mtd: 1,
          total_buyers: 1,
          catalog_days_ago: null,
          categories: ['Audio'],
          catalog_name: null,
          alerts: ['not_in_catalog_mtd'],
        },
      }],
    }];
    dbResponses['app.rpc.get_seller_brand_landing_summary'] = [{
      data: {
        kpis: {
          portfolio_gmv_mtd: 100,
          portfolio_gmv_prev_mtd: 80,
          brands_carried: 1,
          buyers_with_orders_mtd: 1,
          total_buyers: 2,
          need_attention_count: 1,
          catalog_freshness_count: 0,
          total_campaigns: 0,
          catalog_freshness_earliest_days: null,
        },
        todays_read: { needs_attention: [], top_performers: [], top_risers: [] },
        categories: ['Audio', 'Uncategorized'],
        cohorts: [{ id: 'cohort-1', name: 'Tier A' }],
      },
    }];
  });

  it('returns active cohort options without requiring an is_active column', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands?period=month'));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.cohorts).toEqual([{ id: 'cohort-1', name: 'Tier A' }]);
    expect(body.categories).toEqual(['Audio', 'Uncategorized']);
    expect(body.brands).toHaveLength(1);
    expect(body.kpis.total_buyers).toBe(2);
    expect(body.brands[0].total_buyers).toBe(1);
    expect(tableCalls).toEqual([]);
  });

  it('uses the indexed brand search vector and a bounded SQL resultset', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands?search=alpha&limit=25'));

    expect(response.status).toBe(200);
    expect(rpcCalls).toContainEqual(['search_seller_brand_landing_page', expect.objectContaining({
      p_query: 'alpha',
      p_limit: 25,
    })]);
  });

  it('hydrates assistant first-page brands through the location-scoped page RPC', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
      location_ids: ['location-1'],
    });

    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands?period=month'));

    expect(response.status).toBe(200);
    expect(rpcCalls).toContainEqual(['get_seller_brand_landing_rows', expect.objectContaining({
      p_brand_ids: ['brand-1'],
      p_location_ids: ['location-1'],
    })]);
    expect(rpcCalls).toContainEqual(['get_seller_brand_landing_summary', expect.objectContaining({
      p_location_ids: ['location-1'],
    })]);
    expect(tableCalls).toEqual([]);
  });

  it('skips the summary RPC on subsequent pages', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands?offset=50&include_summary=false'));

    expect(response.status).toBe(200);
    expect(rpcCalls.some(([name]) => name === 'get_seller_brand_landing_summary')).toBe(false);
  });
});
