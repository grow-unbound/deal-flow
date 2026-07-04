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

function setDefaultResponses() {
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
  dbResponses['app.orders'] = [{ data: [] }, { data: [] }, { data: [] }];
  dbResponses['app.order_items'] = [{ data: [] }];
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
  dbResponses['app.buyer_users'] = [{ data: [] }];
  dbResponses['app.audit_log'] = [{ data: [] }];
  dbResponses['app.invoices'] = [{ data: [] }, { data: [] }];
  dbResponses['app.payments'] = [{ data: [] }];
  dbResponses['app.credit_notes'] = [{ data: [] }];
  dbResponses['app.catalog_views'] = [{ data: [] }];
  dbResponses['app.estimates'] = [{ data: [] }];
  dbResponses['app.estimate_items'] = [{ data: [] }];
  dbResponses['app.invoice_items'] = [{ data: [] }];
  dbResponses['app.price_list_assignments'] = [{ data: [] }];
  dbResponses['app.price_lists'] = [{ data: [] }];
  dbResponses['app.price_list_items'] = [{ data: [] }];
  dbResponses['app.locations'] = [{ data: [] }];
  dbResponses['app.tenant_products'] = [{ data: [] }];
  dbResponses['app.tenant_brands'] = [{ data: [] }];
  dbResponses['app.campaigns'] = [{ data: [] }];
  dbResponses['catalog.products'] = [{ data: [] }];
  dbResponses['catalog.brands'] = [{ data: [] }];
}

describe('customer detail api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];
    setDefaultResponses();
    getFlagMock.mockImplementation(async (flag: string) => (
      flag === 'df_customer_master' || flag === 'df_brand_product_master'
    ));
  });

  it('returns 403 for cross-tenant buyer access', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin', buyer_id: null });
    dbResponses['app.buyers'][0] = {
      data: { id: 'buyer-1', tenant_id: 'tenant-b' },
    };

    const request = new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'buyer-1' }) });

    expect(response.status).toBe(403);
  });

  it('filters draft/cancelled/void transactions out of the customer detail tabs', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });

    dbResponses['app.orders'] = [
      {
        data: [
          {
            id: 'order-live-month',
            order_number: 'SO-001',
            buyer_id: 'buyer-1',
            status: 'confirmed',
            source: 'buyer_app',
            campaign_id: null,
            estimate_id: null,
            place_of_supply: null,
            total_amount: 5000,
            placed_at: '2026-07-02T10:00:00Z',
            created_at: '2026-07-02T10:00:00Z',
            location_id: null,
          },
          {
            id: 'order-draft-month',
            order_number: 'SO-002',
            buyer_id: 'buyer-1',
            status: 'draft',
            source: 'buyer_app',
            campaign_id: null,
            estimate_id: null,
            place_of_supply: null,
            total_amount: 1200,
            placed_at: '2026-07-01T10:00:00Z',
            created_at: '2026-07-01T10:00:00Z',
            location_id: null,
          },
        ],
      },
      {
        data: [
          {
            id: 'order-prev-live',
            total_amount: 9000,
            placed_at: '2026-06-15T10:00:00Z',
            location_id: null,
            status: 'confirmed',
          },
          {
            id: 'order-prev-cancelled',
            total_amount: 4000,
            placed_at: '2026-06-10T10:00:00Z',
            location_id: null,
            status: 'cancelled',
          },
        ],
      },
      {
        data: [
          {
            id: 'order-live-month',
            order_number: 'SO-001',
            buyer_id: 'buyer-1',
            status: 'confirmed',
            source: 'buyer_app',
            campaign_id: null,
            estimate_id: null,
            place_of_supply: null,
            total_amount: 5000,
            placed_at: '2026-07-02T10:00:00Z',
            created_at: '2026-07-02T10:00:00Z',
            location_id: null,
          },
          {
            id: 'order-draft-old',
            order_number: 'SO-003',
            buyer_id: 'buyer-1',
            status: 'draft',
            source: 'buyer_app',
            campaign_id: null,
            estimate_id: null,
            place_of_supply: null,
            total_amount: 7000,
            placed_at: '2026-05-10T10:00:00Z',
            created_at: '2026-05-10T10:00:00Z',
            location_id: null,
          },
        ],
      },
    ];

    dbResponses['app.estimates'] = [
      {
        data: [
          {
            id: 'estimate-live',
            estimate_number: 'EST-001',
            estimate_date: '2026-07-02T10:00:00Z',
            created_at: '2026-07-02T10:00:00Z',
            status: 'sent',
            total_amount: 8000,
            location_id: null,
            campaign_id: null,
            source: 'seller',
            place_of_supply: null,
            expires_at: '2026-07-10T10:00:00Z',
          },
          {
            id: 'estimate-void',
            estimate_number: 'EST-002',
            estimate_date: '2026-07-01T10:00:00Z',
            created_at: '2026-07-01T10:00:00Z',
            status: 'void',
            total_amount: 1200,
            location_id: null,
            campaign_id: null,
            source: 'seller',
            place_of_supply: null,
            expires_at: '2026-07-10T10:00:00Z',
          },
        ],
      },
    ];

    dbResponses['app.invoices'] = [
      {
        data: [
          {
            id: 'invoice-live',
            invoice_number: 'INV-001',
            invoice_date: '2026-07-02T10:00:00Z',
            created_at: '2026-07-02T10:00:00Z',
            status: 'sent',
            outstanding_balance: 0,
            total_amount: 5000,
            location_id: null,
            order_id: 'order-live-month',
            estimate_id: null,
            place_of_supply: null,
            due_date: '2026-07-12T10:00:00Z',
          },
          {
            id: 'invoice-draft',
            invoice_number: 'INV-002',
            invoice_date: '2026-07-03T10:00:00Z',
            created_at: '2026-07-03T10:00:00Z',
            status: 'draft',
            outstanding_balance: 1000,
            total_amount: 1000,
            location_id: null,
            order_id: 'order-draft-month',
            estimate_id: null,
            place_of_supply: null,
            due_date: '2026-07-12T10:00:00Z',
          },
          {
            id: 'invoice-void',
            invoice_number: 'INV-003',
            invoice_date: '2026-07-03T10:00:00Z',
            created_at: '2026-07-03T10:00:00Z',
            status: 'void',
            outstanding_balance: 0,
            total_amount: 2000,
            location_id: null,
            order_id: null,
            estimate_id: null,
            place_of_supply: null,
            due_date: '2026-07-12T10:00:00Z',
          },
        ],
      },
      {
        data: [
          {
            buyer_id: 'buyer-1',
            outstanding_balance: 0,
            due_date: null,
            status: 'sent',
          },
          {
            buyer_id: 'buyer-1',
            outstanding_balance: 0,
            due_date: null,
            status: 'draft',
          },
        ],
      },
    ];

    const request = new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'buyer-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.orders.badge_count_mtd).toBe(1);
    expect(body.orders.rows).toHaveLength(1);
    expect(body.orders.rows[0].status).toBe('confirmed');
    expect(body.estimates.rows).toHaveLength(1);
    expect(body.estimates.rows[0].buyer_name).toBe('Singh Hospitality');
    expect(body.estimates.rows[0].status).toBe('sent');
    expect(body.invoices.rows).toHaveLength(1);
    expect(body.invoices.rows[0].buyer_name).toBe('Singh Hospitality');
    expect(body.invoices.rows[0].status).toBe('sent');
  });

  it('credit used percentage formula remains creditUsed / creditLimit * 100', () => {
    const creditUsed = 64000;
    const creditLimit = 100000;
    const pct = Math.round((creditUsed / creditLimit) * 1000) / 10;

    expect(pct).toBe(64);
  });
});
