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
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
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

import { GET } from '../../app/api/tenant/brands/route';

describe('brands landing api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);

    dbResponses['app.tenant_brands'] = [
      {
        data: [
          {
            id: 'brand-1',
            tenant_id: 'tenant-1',
            master_brand_id: null,
            display_name_override: 'Alpha',
            slug: null,
            description: null,
            logo_url: null,
            margin_pct: null,
            exclusivity: null,
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
            deleted_at: null,
          },
        ],
      },
    ];
    dbResponses['app.brands_snapshot'] = [{ data: { total_count: 1, active_count: 1, with_products_count: 1, refreshed_at: '2026-06-01T00:00:00Z' } }];
    dbResponses['app.kpi_brand_daily'] = [{ data: [] }, { data: [] }];
    dbResponses['app.tenant_categories'] = [{ data: [{ id: 'category-1', name: 'Audio', deleted_at: null }] }];
    dbResponses['app.cohorts'] = [{ data: [{ id: 'cohort-1', name: 'Tier A', deleted_at: null, allowed_tenant_brand_ids: null }] }];
    dbResponses['catalog.brands'] = [{ data: [] }];
    dbResponses['app.tenant_products'] = [{ data: [] }];
    dbResponses['app.buyers'] = [{
      data: [
        { id: 'buyer-1', default_cohort_id: 'cohort-1' },
        { id: 'buyer-2', default_cohort_id: null },
      ],
    }];
    dbResponses['app.cohort_members'] = [{ data: [] }];
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
  });
});
