import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const updateArgsRef: { value: Record<string, unknown> | null } = { value: null };

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: () => true,
}));

function tableMock(table: string) {
  const q: any = {
    select: () => q,
    eq: () => q,
    is: () => q,
    update: (v: Record<string, unknown>) => { updateArgsRef.value = v; return q; },
    maybeSingle: () => {
      if (table === 'estimates') {
        return Promise.resolve({ data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-1', location_id: null, status: 'draft' }, error: null });
      }
      if (table === 'estimate_items') {
        return Promise.resolve({ data: { id: '22222222-2222-2222-2222-222222222222', estimate_id: '11111111-1111-1111-1111-111111111111', qty: 3, disc_pct: 0 }, error: null });
      }
      if (table === 'tenant_products') {
        return Promise.resolve({ data: { id: '33333333-3333-3333-3333-333333333333', base_selling_price: 100, gst_rate: 18 }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: (table: string) => tableMock(table) }),
  },
}));

import { PATCH } from '../../app/api/tenant/estimates/[id]/items/[itemId]/substitute/route';

describe('PATCH /api/tenant/estimates/[id]/items/[itemId]/substitute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateArgsRef.value = null;
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin', sub: 'user-1' });
  });

  it('re-prices the line from the new product and clears the buyer target', async () => {
    const req = new NextRequest('http://localhost/api/tenant/estimates/11111111-1111-1111-1111-111111111111/items/22222222-2222-2222-2222-222222222222/substitute', {
      method: 'PATCH',
      body: JSON.stringify({ tenant_product_id: '33333333-3333-3333-3333-333333333333' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111', itemId: '22222222-2222-2222-2222-222222222222' }) });
    expect(res.status).toBe(200);
    expect(updateArgsRef.value).toMatchObject({
      tenant_product_id: '33333333-3333-3333-3333-333333333333',
      unit_price: 100,
      tax_pct: 18,
      line_total: 300,
      buyer_target_unit_price_min: null,
      buyer_target_unit_price_max: null,
    });
  });

  it('rejects a non-seller caller', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'buyer_admin', sub: 'user-1' });
    const req = new NextRequest('http://localhost/api/tenant/estimates/11111111-1111-1111-1111-111111111111/items/22222222-2222-2222-2222-222222222222/substitute', {
      method: 'PATCH',
      body: JSON.stringify({ tenant_product_id: '33333333-3333-3333-3333-333333333333' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111', itemId: '22222222-2222-2222-2222-222222222222' }) });
    expect(res.status).toBe(403);
  });
});
