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
const dbResponses: Record<string, QueryResult[]> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
}));

vi.mock('@/lib/server/request-supabase', () => ({
  getRequestSupabaseClient: () => ({ schema: (...args: unknown[]) => schemaMock(...args) }),
}));

import { GET } from '../../app/api/tenant/categories/[id]/route';

describe('GET /api/tenant/categories/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.tenant_categories'] = [
      {
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          tenant_id: 'tenant-1',
          name: 'Cables',
          slug: 'cables',
          description: null,
          is_active: true,
          display_order: 1,
          external_ref: null,
          r2_image_thumb_key: null,
          r2_image_original_key: null,
          r2_image_medium_key: null,
          deleted_at: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
      },
    ];
    dbResponses['app.metrics_category_period_summary'] = [
      {
        data: {
          invoice_value: 50000,
          invoice_count: 12,
          invoice_product_count: 8,
          invoice_buyer_count: 5,
        },
      },
    ];
    dbResponses['app.metrics_category_now_summary'] = [
      {
        data: {
          product_count: 10,
          brand_count: 3,
        },
      },
    ];
  });

  it('returns KPI-only category detail without bundled tab rows', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/tenant/categories/11111111-1111-4111-8111-111111111111'), {
      params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.header.name).toBe('Cables');
    expect(body.data.meta_strip_4.sales_qtd_value).toBe(50000);
    expect(body.data.meta_strip_4.brand_count).toBe(3);
    expect(body.data.products).toBeUndefined();
    expect(body.data.brands).toBeUndefined();
    expect(body.data.overview).toBeUndefined();
  });
});
