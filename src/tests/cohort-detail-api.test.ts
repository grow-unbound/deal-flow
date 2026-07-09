import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getAuthUserEmailMapMock = vi.fn();
const buildCohortMemberBuyerRowsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/auth-user-directory', () => ({
  getAuthUserEmailMap: (...args: unknown[]) => getAuthUserEmailMapMock(...args),
}));

vi.mock('@/lib/server/cohort-composer', () => ({
  buildCohortMemberBuyerRows: (...args: unknown[]) => buildCohortMemberBuyerRowsMock(...args),
  resolveAllBuyerIdsForRules: vi.fn(),
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
    neq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    contains: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.contains.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.single.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null };
  });
  query.maybeSingle.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null };
  });

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

import { GET } from '../../app/api/cohorts/[id]/route';

describe('cohort detail api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
    getAuthUserEmailMapMock.mockResolvedValue(new Map([['user-1', 'owner@yukti.so']]));
    buildCohortMemberBuyerRowsMock.mockResolvedValue([
      {
        id: 'buyer-1',
        business_name: 'Alpha Retail',
        contact_name: 'Asha',
        external_ref: 'B-1',
        geography_label: 'Mumbai',
        tier: 'A',
        mtd_spend: 2400,
        orders_mtd: 2,
        credit_used: 0,
        last_order_at: '2026-07-08T10:00:00Z',
        initials: 'AR',
        hue: 'teal',
      },
    ]);

    dbResponses['app.cohorts'] = [
      { data: { id: 'cohort-1', tenant_id: 'tenant-1' } },
      {
        data: {
          id: 'cohort-1',
          tenant_id: 'tenant-1',
          name: 'High Intent',
          description: 'Recent buyers',
          rules: { filters: [] },
          is_static: false,
          cached_member_count: 2,
          last_refreshed_at: '2026-07-01T00:00:00Z',
          created_at: '2026-06-01T00:00:00Z',
          created_by: 'user-1',
          updated_at: '2026-07-08T00:00:00Z',
          allowed_tenant_brand_ids: ['brand-1'],
        },
      },
    ];
    dbResponses['app.buyers'] = [
      {
        data: [
          { id: 'buyer-1', business_name: 'Alpha Retail', tier: 'A', geography: { city: 'Mumbai' } },
          { id: 'buyer-2', business_name: 'Bravo Stores', tier: 'B', geography: { city: 'Pune' } },
        ],
      },
    ];
    dbResponses['app.cohort_members'] = [
      {
        data: [
          { cohort_id: 'cohort-1', buyer_id: 'buyer-1' },
          { cohort_id: 'cohort-1', buyer_id: 'buyer-2' },
        ],
      },
    ];
    dbResponses['app.campaigns'] = [
      {
        data: [
          {
            id: 'catalog-1',
            scope_type: 'cohort',
            scope_value: { cohort_id: 'cohort-1' },
            status: 'published',
            name: 'July Push',
            valid_from: '2026-07-01T00:00:00Z',
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-02T00:00:00Z',
          },
        ],
      },
    ];
    dbResponses['app.orders'] = [
      {
        data: [
          {
            id: 'order-1',
            buyer_id: 'buyer-1',
            total_amount: 1200,
            status: 'received',
            placed_at: '2026-07-05T03:00:00Z',
            order_date: '2026-07-05',
            campaign_id: 'catalog-1',
          },
          {
            id: 'order-2',
            buyer_id: 'buyer-2',
            total_amount: 1200,
            status: 'received',
            placed_at: '2026-07-07T03:00:00Z',
            order_date: '2026-07-07',
            campaign_id: null,
          },
        ],
      },
      {
        data: [
          {
            id: 'order-1',
            buyer_id: 'buyer-1',
            total_amount: 1200,
            status: 'received',
            placed_at: '2026-07-05T03:00:00Z',
            order_date: '2026-07-05',
            campaign_id: 'catalog-1',
          },
        ],
      },
    ];
    dbResponses['app.campaign_views'] = [
      {
        data: [
          { buyer_id: 'buyer-1', campaign_id: 'catalog-1', viewed_at: '2026-07-03T10:00:00Z', view_date: '2026-07-03' },
          { buyer_id: 'buyer-1', campaign_id: 'catalog-1', viewed_at: '2026-07-04T10:00:00Z', view_date: '2026-07-04' },
          { buyer_id: 'buyer-2', campaign_id: 'catalog-1', viewed_at: '2026-07-04T12:00:00Z', view_date: '2026-07-04' },
        ],
      },
    ];
    dbResponses['app.campaign_items'] = [
      {
        data: [{ campaign_id: 'catalog-1', tenant_product_id: 'tp-1' }],
      },
    ];
    dbResponses['app.tenant_products'] = [
      {
        data: [{ id: 'tp-1', tenant_brand_id: 'brand-1' }],
      },
    ];
    dbResponses['app.tenant_brands'] = [
      {
        data: [{ id: 'brand-1', display_name_override: 'WineYard', master_brand_id: null }],
      },
    ];
    dbResponses['catalog.brands'] = [{ data: [] }];
  });

  it('uses campaign_views for cohort catalog engagement without calling PostHog', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(
      new NextRequest('http://localhost:3000/api/cohorts/cohort-1'),
      { params: Promise.resolve({ id: 'cohort-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meta_strip_4.conversion_pct).toBe(50);
    expect(body.performance.catalogs).toEqual([
      expect.objectContaining({
        campaign_id: 'catalog-1',
        opens: 2,
        orders: 1,
      }),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
