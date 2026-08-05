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
    dbResponses['app.metrics_category_period_summary'] = {
      data: [{
        tenant_category_id: 'cat-1',
        invoice_count: 2,
        invoice_value: 1200,
        invoice_product_count: 1,
        invoice_buyer_count: 2,
      }],
    };
    dbResponses['app.tenant_products'] = {
      data: [
        { id: 'product-1', tenant_category_id: 'cat-1', tenant_brand_id: 'brand-1', is_active: true },
        { id: 'product-2', tenant_category_id: 'cat-1', tenant_brand_id: 'brand-2', is_active: true },
      ],
    };
    dbResponses['app.tenant_inventory'] = {
      data: [
        { tenant_product_id: 'product-1', qty_available: 8, reorder_point: 4 },
        { tenant_product_id: 'product-2', qty_available: 0, reorder_point: 4 },
      ],
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

  it('returns V4 category metrics with inventory posture', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toEqual(expect.objectContaining({
      invoice_value: 1200,
      invoice_count: 2,
      invoice_product_count: 1,
      invoice_buyer_count: 2,
      stock_on_hand: 8,
      oos_sku_count: 1,
      brand_count: 2,
    }));
  });

  it('uses V4 category summaries with bounded identity, product, and inventory enrichment', async () => {
    await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));

    expect(rpcCalls).toHaveLength(0);
    expect(fromCalls).toContain('app.tenant_categories');
    expect(fromCalls).toContain('app.metrics_category_period_summary');
    expect(fromCalls).toContain('app.tenant_products');
    expect(fromCalls).toContain('app.tenant_inventory');
    expect(inCalls).toContainEqual(['app.metrics_category_period_summary', 'tenant_category_id', ['cat-1']]);
    expect(inCalls).toContainEqual(['app.tenant_inventory', 'tenant_product_id', ['product-1', 'product-2']]);
  });

  it('filters searched category rows without raw commercial aggregation', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?search=cables&limit=20'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe('Cables');
    expect(rpcCalls).toHaveLength(0);
  });

  it('does not return V2 summary/callout payload fields', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/tenant/categories/landing?period=month',
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.kpis).toBeUndefined();
    expect(body.callouts).toBeUndefined();
  });

  it('returns V4-aligned filters and table fields', async () => {
    const response = await GET(new NextRequest('http://localhost/api/tenant/categories/landing?period=month'));
    const body = await response.json();

    expect(body.filters.groups.find((group: { key: string }) => group.key === 'status').options).toEqual([
      { value: 'Active', label: 'Active' },
      { value: 'Dormant', label: 'Dormant' },
      { value: 'Inactive', label: 'Inactive' },
    ]);
    expect(body.rows[0]).toEqual(expect.objectContaining({
      active_sku_count: 2,
      gmv_mtd: 1200,
      invoice_count: 2,
      invoice_buyer_count: 2,
    }));
  });
});
