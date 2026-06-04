import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getAuthUserEmailMapMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/auth-user-directory', () => ({
  getAuthUserEmailMap: (...args: unknown[]) => getAuthUserEmailMapMock(...args),
}));

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null })),
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);

  return query;
}

const dbResponses: Record<string, QueryResult> = {};

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(dbResponses[`${schemaName}.${tableName}`] ?? {})),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET as getPriceListDetail } from '../../app/api/price-lists/[id]/route';
import { GET as getPriceListItems } from '../../app/api/price-lists/[id]/items/route';

describe('price list detail api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
    getAuthUserEmailMapMock.mockResolvedValue(new Map([['user-1', 'owner@dealflow.in']]));

    dbResponses['app.price_lists'] = {
      data: {
        id: 'pl-1',
        tenant_id: 'tenant-1',
        name: 'Summer Promo',
        valid_from: '2026-06-01T00:00:00Z',
        valid_to: '2026-06-30T00:00:00Z',
        is_active: true,
        priority: 1,
        created_by: 'user-1',
        updated_by: 'user-1',
      },
    };
    dbResponses['app.price_list_items'] = {
      data: [
        {
          id: 'item-1',
          price_list_id: 'pl-1',
          tenant_product_id: 'tp-1',
          price: 900,
          min_qty: 1,
          max_qty: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
          tenant_product: {
            id: 'tp-1',
            internal_sku: 'SKU-1',
            name_override: null,
            mrp: 1200,
            base_selling_price: 1000,
            is_active: true,
            master_product_id: 'mp-1',
            tenant_brand: {
              id: 'tb-1',
              display_name_override: null,
              master_brand_id: 'mb-1',
            },
          },
        },
      ],
    };
    dbResponses['app.price_list_assignments'] = { data: [] };
    dbResponses['app.audit_log'] = { data: [] };
    dbResponses['catalog.products'] = { data: [{ id: 'mp-1', name: 'Cabernet' }] };
    dbResponses['catalog.brands'] = { data: [{ id: 'mb-1', name: 'WineYard' }] };
  });

  it('returns enriched item names without cross-schema embedded selects', async () => {
    const request = new NextRequest('http://localhost:3000/api/price-lists/pl-1');
    const response = await getPriceListDetail(request, { params: Promise.resolve({ id: 'pl-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.price_list.items).toHaveLength(1);
    expect(body.price_list.items[0].tenant_product.master_product).toEqual({ name: 'Cabernet' });
    expect(body.price_list.items[0].tenant_product.tenant_brand.master_brand).toEqual({ name: 'WineYard' });
    expect(body.price_list.created_by_label).toBe('owner@dealflow.in');
  });

  it('returns enriched items from the items endpoint', async () => {
    const request = new NextRequest('http://localhost:3000/api/price-lists/pl-1/items');
    const response = await getPriceListItems(request, { params: Promise.resolve({ id: 'pl-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].tenant_product.master_product).toEqual({ name: 'Cabernet' });
    expect(body.items[0].tenant_product.tenant_brand.master_brand).toEqual({ name: 'WineYard' });
  });
});
