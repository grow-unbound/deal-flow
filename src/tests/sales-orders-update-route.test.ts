import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const loadTenantSalesOrderComposerMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();
const resolveDefaultSellerLocationIdMock = vi.fn();
const loadAccessibleSellerLocationsMock = vi.fn();

let lastOrderUpdate: Record<string, unknown> | null = null;

class QueryMock {
  constructor(private readonly table: string) {}

  select() { return this; }
  eq() { return this; }
  is() { return this; }
  in() { return this; }
  maybeSingle() {
    if (this.table === 'orders') {
      return Promise.resolve({
        data: {
          id: 'ord-1',
          tenant_id: 'tenant-1',
          location_id: 'loc-1',
          status: 'draft',
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
  update(payload: Record<string, unknown>) {
    if (this.table === 'orders') {
      lastOrderUpdate = payload;
    }
    return this;
  }
  insert() {
    return Promise.resolve({ data: { id: 'audit-1' }, error: null });
  }
  rpc() {
    return Promise.resolve({ data: null, error: null });
  }
  single() {
    return Promise.resolve({ data: { id: 'ord-1' }, error: null });
  }
  then(resolve: (value: { data: unknown; error: null }) => void) {
    if (this.table === 'orders') {
      return resolve({ data: { id: 'ord-1', tenant_id: 'tenant-1', location_id: 'loc-1', status: 'draft' }, error: null });
    }
    return resolve({ data: [], error: null });
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
  isSellerLocationSelectionAllowed: vi.fn(() => true),
  loadAccessibleSellerLocations: (...args: unknown[]) => loadAccessibleSellerLocationsMock(...args),
  resolveDefaultSellerLocationId: (...args: unknown[]) => resolveDefaultSellerLocationIdMock(...args),
}));

vi.mock('@/lib/sales-orders/load-tenant-sales-order-composer', () => ({
  loadTenantSalesOrderComposer: (...args: unknown[]) => loadTenantSalesOrderComposerMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: (table: string) => new QueryMock(table),
    }),
  },
}));

describe('PATCH /api/tenant/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOrderUpdate = null;
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
    canAccessDocumentLocationMock.mockReturnValue(true);
    resolveDefaultSellerLocationIdMock.mockReturnValue('loc-1');
    loadAccessibleSellerLocationsMock.mockResolvedValue([{ id: 'loc-1', name: 'Main warehouse' }]);
    loadTenantSalesOrderComposerMock.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      order_number: 'SO-1',
      status: 'draft',
      place_of_supply: 'Maharashtra',
      buyer_id: '22222222-2222-2222-2222-222222222222',
      location_id: '33333333-3333-3333-3333-333333333333',
      location_name: 'Main warehouse',
      available_locations: [],
      order_date: '2026-07-01',
      expected_delivery: '2026-07-08',
      buyer_po_ref: '',
      seller_note: '',
      freight: 0,
      discount_flat: 0,
      round_off: 0,
      has_backorder: false,
      estimate_id: null,
      source_estimate_number: null,
      buyer_context: null,
      items: [],
    });
  });

  it('persists place_of_supply from the save payload', async () => {
    const { PATCH } = await import('../../app/api/tenant/orders/[id]/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/orders/11111111-1111-1111-1111-111111111111', {
        method: 'PATCH',
        body: JSON.stringify({
          place_of_supply: 'Karnataka',
          buyer_id: '22222222-2222-2222-2222-222222222222',
          location_id: '33333333-3333-3333-3333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) },
    );

    expect(res.status).toBe(200);
    expect(lastOrderUpdate?.place_of_supply).toBe('Karnataka');
  });

  it('persists canonical order_date alongside placed_at', async () => {
    const { PATCH } = await import('../../app/api/tenant/orders/[id]/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/orders/11111111-1111-1111-1111-111111111111', {
        method: 'PATCH',
        body: JSON.stringify({
          order_date: '2026-07-09',
          buyer_id: '22222222-2222-2222-2222-222222222222',
          location_id: '33333333-3333-3333-3333-333333333333',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) },
    );

    expect(res.status).toBe(200);
    expect(lastOrderUpdate?.order_date).toBe('2026-07-09');
    expect(lastOrderUpdate?.placed_at).toBe('2026-07-09T12:00:00.000Z');
  });
});
