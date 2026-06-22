import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const loadBuyerCreditSnapshotMock = vi.fn();

const dbState = {
  buyer: {
    id: 'buyer-1',
    tenant_id: 'tenant-1',
    business_name: 'Rajan Wine Merchants',
    contact_name: 'Rajan Mehta',
    credit_limit: 250000,
    phone: '9876543210',
    gstin: '07AABCR1234M1Z5',
    buyer_app_enabled: true,
  },
  buyerUsers: [
    { buyer_id: 'buyer-1', phone: '9876543210', is_active: true, deleted_at: null },
  ],
  tenantSettings: {
    settings: {
      orders: { features: { enquiries: false, sales_orders: true, invoices: true } },
      business_policy: { credit_enabled: true, gst_inclusive: false },
    },
  },
  orders: [] as Array<{ id: string; total_amount: number; status: string }>,
  conflictPhone: null as string | null,
};

function createQueryBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  let updatePayload: Record<string, unknown> | null = null;

  const builder: Record<string, any> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      if (table === 'buyers' && updatePayload && filters.id && filters.tenant_id) {
        Object.assign(dbState.buyer, updatePayload);
      }
      return builder;
    },
    in: (column: string, value: unknown[]) => {
      filters[column] = value;
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filters[`neq:${column}`] = value;
      return builder;
    },
    maybeSingle: async () => {
      if (table === 'tenant_settings') {
        return { data: dbState.tenantSettings, error: null };
      }

      if (table === 'buyers') {
        const phone = filters.phone;
        if (typeof phone === 'string') {
          if (dbState.conflictPhone && phone === dbState.conflictPhone) {
            return { data: { id: dbState.buyer.id }, error: null };
          }

          return { data: null, error: null };
        }

        if (filters.id === dbState.buyer.id) {
          return { data: dbState.buyer, error: null };
        }

        return { data: dbState.buyer, error: null };
      }

      return { data: null, error: null };
    },
    single: async () => ({ data: dbState.buyer, error: null }),
    update: (payload: Record<string, unknown>) => {
      updatePayload = payload;
      return builder;
    },
    order: () => builder,
    limit: async () => {
      if (table === 'orders') {
        return { data: dbState.orders, error: null };
      }
      return { data: [], error: null };
    },
    then: undefined,
  };

  builder.in = (column: string, value: unknown[]) => {
    filters[column] = value;
    return {
      is: async () => ({ data: dbState.orders, error: null }),
    };
  };
  builder.is = (column: string, value: unknown) => {
    filters[column] = value;

    if (table === 'buyer_users' && updatePayload) {
      dbState.buyerUsers = dbState.buyerUsers.map((row) => ({ ...row, phone: String(updatePayload?.phone ?? row.phone) }));
    }

    return builder;
  };
  builder.order = () => ({
    limit: async () => ({ data: dbState.orders, error: null }),
  });

  return builder;
}

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/buyer-credit', () => ({
  loadBuyerCreditSnapshot: (...args: unknown[]) => loadBuyerCreditSnapshotMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => createQueryBuilder(table)),
    })),
  },
}));

describe('buyer me route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    loadBuyerCreditSnapshotMock.mockReset();
    dbState.buyer = {
      id: 'buyer-1',
      tenant_id: 'tenant-1',
      business_name: 'Rajan Wine Merchants',
      contact_name: 'Rajan Mehta',
      credit_limit: 250000,
      phone: '9876543210',
      gstin: '07AABCR1234M1Z5',
      buyer_app_enabled: true,
    };
    dbState.buyerUsers = [
      { buyer_id: 'buyer-1', phone: '9876543210', is_active: true, deleted_at: null },
    ];
    dbState.orders = [];
    dbState.conflictPhone = null;
    loadBuyerCreditSnapshotMock.mockResolvedValue({ credit_used: 84200 });
  });

  it('returns the resolved greeting name for authenticated buyers', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'buyer_admin',
        buyer_id: 'buyer-1',
        location_ids: null,
        mode: 'buyer',
        share_token: null,
        preview: null,
      },
      buyer: dbState.buyer,
      tenant: {
        id: 'tenant-1',
        business_name: 'Tenant One',
        slug: 'tenant-one',
      },
      greeting_name: 'Rajan',
    });

    const { GET } = await import('../../app/api/buyer/me/route');
    const response = await GET(new Request('http://localhost/api/buyer/me') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.greeting_name).toBe('Rajan');
    expect(body.business_name).toBe('Rajan Wine Merchants');
    expect(body.phone).toBe('9876543210');
    expect(body.gstin).toBe('07AABCR1234M1Z5');
  });

  it('allows buyer_admin to update business details and phone', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'buyer_admin',
        buyer_id: 'buyer-1',
        location_ids: null,
        mode: 'buyer',
        share_token: null,
        preview: null,
      },
      buyer: dbState.buyer,
      tenant: {
        id: 'tenant-1',
        business_name: 'Tenant One',
        slug: 'tenant-one',
      },
      greeting_name: 'Rajan',
    });

    const { PATCH } = await import('../../app/api/buyer/me/route');
    const response = await PATCH(new Request('http://localhost/api/buyer/me', {
      method: 'PATCH',
      body: JSON.stringify({
        business_name: 'Rajan Spirits',
        contact_name: 'Rajan M',
        gstin: '29ABCDE1234F1Z5',
        phone: '9123456789',
      }),
      headers: { 'Content-Type': 'application/json' },
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.business_name).toBe('Rajan Spirits');
    expect(body.contact_name).toBe('Rajan M');
    expect(body.gstin).toBe('29ABCDE1234F1Z5');
    expect(body.phone).toBe('9123456789');
    expect(dbState.buyerUsers[0].phone).toBe('9123456789');
  });

  it('allows buyer_assistant to update only phone', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'buyer_assistant',
        buyer_id: 'buyer-1',
        location_ids: null,
        mode: 'buyer',
        share_token: null,
        preview: null,
      },
      buyer: dbState.buyer,
      tenant: {
        id: 'tenant-1',
        business_name: 'Tenant One',
        slug: 'tenant-one',
      },
      greeting_name: 'Rajan',
    });

    const { PATCH } = await import('../../app/api/buyer/me/route');
    const response = await PATCH(new Request('http://localhost/api/buyer/me', {
      method: 'PATCH',
      body: JSON.stringify({
        business_name: 'Blocked Rename',
        phone: '9988776655',
      }),
      headers: { 'Content-Type': 'application/json' },
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.business_name).toBe('Rajan Wine Merchants');
    expect(body.phone).toBe('9988776655');
  });

  it('returns 409 when the next phone number already exists on another buyer', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'buyer_admin',
        buyer_id: 'buyer-1',
        location_ids: null,
        mode: 'buyer',
        share_token: null,
        preview: null,
      },
      buyer: dbState.buyer,
      tenant: {
        id: 'tenant-1',
        business_name: 'Tenant One',
        slug: 'tenant-one',
      },
      greeting_name: 'Rajan',
    });

    dbState.conflictPhone = '9988776655';

    const { PATCH } = await import('../../app/api/buyer/me/route');
    const response = await PATCH(new Request('http://localhost/api/buyer/me', {
      method: 'PATCH',
      body: JSON.stringify({ phone: '9988776655' }),
      headers: { 'Content-Type': 'application/json' },
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });
});
