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

vi.mock('@/lib/server/seller-location-access', () => ({
  applySellerLocationScope: (query: unknown) => query,
  loadAccessibleSellerLocations: async () => [],
}));

type QueryResult = { data?: unknown; error?: unknown };

const dbResponses: Record<string, QueryResult[]> = {};
const queryInstances = new Map<string, ReturnType<typeof createQuery>>();

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
    not: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    gte: vi.fn(),
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
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null, count: 0 };
  });
  query.limit.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null };
  });
  queryInstances.set(key, query);

  return query;
}

const fromMock = vi.fn((schemaName: string, tableName: string) => ({
  select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
}));
const rpcMock = vi.fn((fnName: string) => {
  const result = nextResult(`rpc.${fnName}`);
  return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
});
const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => fromMock(schemaName, tableName)),
  rpc: vi.fn((fnName: string, args: unknown) => rpcMock(fnName, args)),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET as getCustomerDetail } from '../../app/api/tenant/customers/[id]/route';
import { GET as getCustomerDocuments } from '../../app/api/tenant/customers/[id]/documents/route';

function setBootstrapDefaults() {
  dbResponses['app.buyers'] = [
    {
      data: {
        id: 'buyer-1',
        tenant_id: 'tenant-1',
        business_name: 'Singh Hospitality',
        contact_name: 'R Singh',
        phone: '9876543210',
        email: 'ops@singh.co',
        gstin: '29ABCDE1234F1Z5',
        gst_treatment: 'regular',
        billing_address: null,
        shipping_address: null,
        is_active: true,
        buyer_app_enabled: true,
        credit_limit: 100000,
        payment_terms_days: 21,
        default_cohort_id: 'cohort-1',
        default_price_list_id: 'pl-1',
        geography: { city: 'Bengaluru', state: 'Karnataka', pincode: '560001', zone: 'South' },
        created_at: '2021-05-10T00:00:00Z',
        whatsapp_opt_out_at: null,
      },
    },
  ];
  dbResponses['app.buyer_users'] = [{ data: [] }];
  dbResponses['app.cohort_members'] = [
    { data: [{ cohort_id: 'cohort-1', cohorts: { name: 'Premium', deleted_at: null } }] },
  ];
  dbResponses['app.price_lists'] = [{ data: { id: 'pl-1', name: 'North Premium Pricing' } }];
  dbResponses['rpc.get_seller_customer_detail_v2'] = [
    {
      data: {
        performance_cards: [],
        summary_metrics: {
          invoiced_sales_90d: 250000,
          invoice_count_90d: 4,
          primary_demand_kind: 'orders',
          primary_demand_value_90d: 188000,
          primary_demand_order_count_90d: 3,
          primary_demand_estimate_count_90d: 1,
          receivable_amount: 64000,
          credit_available: 36000,
          credit_limit: 100000,
          last_invoice_value: 84200,
          last_invoice_date: '2026-07-16T00:00:00Z',
          last_activity_at: '2026-07-16T00:00:00Z',
          last_activity_kind: 'sale',
        },
        subtitle_meta: {
          buyer_app_status_label: 'Buyer App enabled',
          last_activity_at: '2026-07-16T00:00:00Z',
          last_activity_kind: 'sale',
          last_activity_days_ago: 3,
        },
        tab_badges: {
          estimates_90d: 1,
          orders_90d: 3,
          invoices_90d: 4,
          price_lists_assigned: 2,
        },
      },
    },
  ];
}

describe('customer detail bootstrap route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];
    queryInstances.clear();
    setBootstrapDefaults();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('returns a metrics-first bootstrap payload with tab badges and no eager document arrays', async () => {
    const response = await getCustomerDetail(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1'),
      { params: Promise.resolve({ id: 'buyer-1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tab_badges).toEqual({
      estimates_90d: 1,
      orders_90d: 3,
      invoices_90d: 4,
      price_lists_assigned: 2,
    });
    expect(body.meta_strip_4.invoiced_sales_90d).toBe(250000);
    expect(body.meta_strip_4.demand_90d).toBe(188000);
    expect(body.meta_strip_4.last_invoice_value).toBe(84200);
    expect(body.price_lists).toEqual({ assigned_count: 2 });
    expect(body.header.subtitle_meta.last_activity_kind).toBe('sale');
    expect(body.orders).toBeUndefined();
    expect(body.estimates).toBeUndefined();
    expect(body.invoices).toBeUndefined();
    expect(body.activity).toBeUndefined();
  });
});

describe('customer documents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];
    queryInstances.clear();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    dbResponses['app.buyers'] = [{ data: { id: 'buyer-1' } }];
    dbResponses['app.orders'] = [{ data: [], error: null }];
    dbResponses['app.order_items'] = [{ data: [] }];
  });

  it('applies the default this-month period bound', async () => {
    await getCustomerDocuments(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1/documents?kind=order'),
      { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) },
    );

    expect(queryInstances.get('app.orders')?.or).toHaveBeenCalled();
  });
});
