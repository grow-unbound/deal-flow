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
const queriesByKey: Record<string, Array<ReturnType<typeof createQuery>>> = {};

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
    ilike: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.ilike.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  queriesByKey[key] ??= [];
  queriesByKey[key].push(query);
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
    for (const key of Object.keys(queriesByKey)) delete queriesByKey[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.metrics_brand_period_summary'] = [
      {
        data: [
          {
            tenant_brand_id: 'brand-1',
            invoice_count: 9,
            invoice_value: 100000,
            invoice_product_count: 4,
            invoice_buyer_count: 7,
          },
        ],
      },
      { data: [{ invoice_value: 100000 }] },
    ];
    dbResponses['app.tenant_brands'] = [{
      data: [{
        id: 'brand-1',
        tenant_id: 'tenant-1',
        master_brand_id: 'master-1',
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
        default_cohort_id: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }],
    }];
    dbResponses['catalog.brands'] = [{ data: [{ id: 'master-1', name: 'Alpha Master', slug: 'alpha', logo_url: null, description: null }] }];
    dbResponses['app.tenant_products'] = [{ data: [{ tenant_brand_id: 'brand-1' }, { tenant_brand_id: 'brand-1' }] }];
  });

  it('reads V4 brand period summaries for rows', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands?limit=25'));

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.brands).toHaveLength(1);
    expect(body.brands[0]).toEqual(expect.objectContaining({
      id: 'brand-1',
      gmv_mtd: 100000,
      sku_count: 2,
      invoice_count: 9,
      invoice_product_count: 4,
      invoice_buyer_count: 7,
    }));
    expect(body.period_key).toBe('this_month');
    expect(body.nextCursor).toBeNull();
    expect(body.filters.groups[0]).toEqual(expect.objectContaining({ key: 'status', label: 'Status' }));
    expect(rpcCalls).toEqual([]);
    expect(tableCalls).toEqual([
      'app.tenant_brands',
      'app.tenant_brands',
      'app.metrics_brand_period_summary',
      'catalog.brands',
      'app.tenant_brands',
      'app.tenant_products',
      'app.metrics_brand_period_summary',
      'catalog.brands',
    ]);
    expect(queriesByKey['app.metrics_brand_period_summary'][0].eq).toHaveBeenCalledWith('grain', 'month');
    expect(queriesByKey['app.metrics_brand_period_summary'][0].in).toHaveBeenCalledWith('tenant_brand_id', ['brand-1']);
  });

  it('blocks seller assistants from brands landing', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
      location_ids: ['location-1'],
    });

    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands'));

    expect(response.status).toBe(403);
    expect(tableCalls).toEqual([]);
  });

  it('uses raw brand identity search as a bounded prefilter before V4 rows', async () => {
    dbResponses['app.tenant_brands'] = [
      { data: [{ id: 'brand-1' }] },
      { data: [{
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
        default_cohort_id: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }],
    }];
    dbResponses['catalog.brands'] = [{ data: [] }];

    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/brands?search=alpha'));

    expect(response.status).toBe(200);
    expect(queriesByKey['app.metrics_brand_period_summary'][0].in).toHaveBeenCalledWith('tenant_brand_id', ['brand-1']);
    expect(rpcCalls).toEqual([]);
  });

  it('applies top80 preset with the V4 top80 cache', async () => {
    dbResponses['app.metrics_tenant_top80_cache'] = [{ data: [{ top80_count: 1 }] }];
    const preset = encodeURIComponent(JSON.stringify({ sort: 'invoice_value_desc', cutoff: 'top80' }));

    const response = await GET(new NextRequest(`http://localhost:3000/api/tenant/brands?filter_preset=${preset}&limit=25`));

    expect(response.status).toBe(200);
    expect(queriesByKey['app.metrics_tenant_top80_cache'][0].eq).toHaveBeenCalledWith('entity_kind', 'brands');
    expect(queriesByKey['app.metrics_brand_period_summary'][0].gt).toHaveBeenCalledWith('invoice_value', 0);
    expect(queriesByKey['app.metrics_brand_period_summary'][0].limit).toHaveBeenCalledWith(2);
  });
});
