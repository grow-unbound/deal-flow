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
  if (queue.length <= 1) {
    return queue[0] ?? {};
  }
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
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
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

import { GET } from '../../app/api/tenant/customers/[id]/route';

describe('customer detail price-list api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockImplementation(async (flag: string) => (
      flag === 'df_customer_master' || flag === 'df_brand_product_master'
    ));

    dbResponses['app.buyers'] = [
      {
        data: { id: 'buyer-1', tenant_id: 'tenant-1' },
      },
      {
        data: {
          id: 'buyer-1',
          tenant_id: 'tenant-1',
          business_name: 'Singh Hospitality',
          contact_name: 'R Singh',
          phone: '9876543210',
          email: 'ops@singh.co',
          gstin: '29ABCDE1234F1Z5',
          tier: 'A',
          is_active: true,
          credit_limit: 100000,
          payment_terms_days: 21,
          external_ref: 'ER-1',
          default_cohort_id: 'cohort-1',
          geography: { city: 'Bengaluru', state: 'Karnataka', pincode: '560001', zone: 'South' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      },
      {
        data: [{ id: 'buyer-1', business_name: 'Singh Hospitality' }],
      },
    ];
    dbResponses['app.orders'] = [
      { data: [] },
      { data: [] },
      { data: [] },
    ];
    dbResponses['app.cohort_members'] = [
      {
        data: [
          {
            cohort_id: 'cohort-1',
            cohorts: { name: 'Premium', deleted_at: null },
          },
        ],
      },
    ];
    dbResponses['app.audit_log'] = [{ data: [] }];
    dbResponses['app.invoices'] = [{ data: [] }];
    dbResponses['app.payments'] = [{ data: [] }];
    dbResponses['app.credit_notes'] = [{ data: [] }];
    dbResponses['app.catalog_views'] = [{ data: [] }];
    dbResponses['app.estimates'] = [{ data: [] }];
    dbResponses['app.price_list_assignments'] = [
      {
        data: [
          {
            id: 'assign-buyer',
            price_list_id: 'pl-buyer',
            target_type: 'buyer',
            target_id: 'buyer-1',
            created_at: '2026-06-01T00:00:00Z',
          },
          {
            id: 'assign-cohort',
            price_list_id: 'pl-cohort',
            target_type: 'cohort',
            target_id: 'cohort-1',
            created_at: '2026-06-01T00:00:00Z',
          },
          {
            id: 'assign-all',
            price_list_id: 'pl-all',
            target_type: 'all_buyers',
            target_id: null,
            created_at: '2026-06-01T00:00:00Z',
          },
        ],
      },
    ];
    dbResponses['app.price_lists'] = [
      {
        data: [
          {
            id: 'pl-buyer',
            name: 'Buyer Special',
            valid_from: '2026-06-01T00:00:00Z',
            valid_to: '2026-06-30T00:00:00Z',
            is_active: true,
            priority: 50,
          },
          {
            id: 'pl-cohort',
            name: 'Premium Cohort',
            valid_from: '2026-07-01T00:00:00Z',
            valid_to: '2026-07-31T00:00:00Z',
            is_active: true,
            priority: 20,
          },
          {
            id: 'pl-all',
            name: 'Fallback Base',
            valid_from: '2026-04-01T00:00:00Z',
            valid_to: '2026-05-01T00:00:00Z',
            is_active: true,
            priority: 5,
          },
        ],
      },
    ];
    dbResponses['app.price_list_items'] = [
      {
        data: [
          { price_list_id: 'pl-buyer', tenant_product_id: 'tp-1' },
          { price_list_id: 'pl-cohort', tenant_product_id: 'tp-2' },
          { price_list_id: 'pl-all', tenant_product_id: 'tp-2' },
        ],
      },
    ];
    dbResponses['app.tenant_products'] = [
      {
        data: [
          {
            id: 'tp-1',
            internal_sku: 'SKU-1',
            name_override: 'Cabernet Reserve',
            master_product_id: null,
          },
          {
            id: 'tp-2',
            internal_sku: 'SKU-2',
            name_override: null,
            master_product_id: 'mp-2',
          },
        ],
      },
    ];
    dbResponses['catalog.products'] = [
      {
        data: [{ id: 'mp-2', name: 'Merlot Classic' }],
      },
    ];
    dbResponses['app.tenant_brands'] = [{ data: [] }];
    dbResponses['catalog.brands'] = [{ data: [] }];
  });

  it('returns buyer, cohort, and all-buyers price-list assignments with resolved labels', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1'),
      { params: Promise.resolve({ id: 'buyer-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.price_lists.assigned).toHaveLength(3);
    expect(body.price_lists.assigned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pl-buyer',
          name: 'Buyer Special',
          target_type: 'buyer',
          target_label: expect.stringMatching(/Buyer specific · Singh Hospitality/),
        }),
        expect.objectContaining({
          id: 'pl-cohort',
          name: 'Premium Cohort',
          target_type: 'cohort',
          target_label: 'Cohort · Premium',
        }),
        expect.objectContaining({
          id: 'pl-all',
          name: 'Fallback Base',
          target_type: 'all_buyers',
          target_label: 'All buyers',
        }),
      ]),
    );
  });

  it('derives active, draft, and expired statuses from validity and activation fields', async () => {
    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'));

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1'),
      { params: Promise.resolve({ id: 'buyer-1' }) },
    );
    const body = await response.json();

    const statuses = new Map(body.price_lists.assigned.map((row: { id: string; status: string }) => [row.id, row.status]));
    expect(statuses.get('pl-buyer')).toBe('active');
    expect(statuses.get('pl-cohort')).toBe('draft');
    expect(statuses.get('pl-all')).toBe('expired');
  });

  it('builds lookup products from applicable price-list items', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1'),
      { params: Promise.resolve({ id: 'buyer-1' }) },
    );
    const body = await response.json();

    expect(body.price_lists.lookup_products).toEqual([
      {
        tenant_product_id: 'tp-1',
        name: 'Cabernet Reserve',
        sku: 'SKU-1',
      },
      {
        tenant_product_id: 'tp-2',
        name: 'Merlot Classic',
        sku: 'SKU-2',
      },
    ]);
  });
});
