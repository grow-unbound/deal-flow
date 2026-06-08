import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const loadTenantSalesOrderDetailMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/sales-orders/load-tenant-sales-order-detail', () => ({
  loadTenantSalesOrderDetail: (...args: unknown[]) => loadTenantSalesOrderDetailMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {},
}));

describe('GET /api/tenant/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('returns 403 when loader reports cross-tenant', async () => {
    loadTenantSalesOrderDetailMock.mockResolvedValue('forbidden');

    const { GET } = await import('../../app/api/tenant/orders/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/orders/ord-x'), {
      params: Promise.resolve({ id: 'ord-x' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/i);
  });

  it('returns 404 when loader reports not found', async () => {
    loadTenantSalesOrderDetailMock.mockResolvedValue('notfound');

    const { GET } = await import('../../app/api/tenant/orders/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/orders/ord-missing'), {
      params: Promise.resolve({ id: 'ord-missing' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns detail JSON when loader succeeds', async () => {
    loadTenantSalesOrderDetailMock.mockResolvedValue({
      id: 'ord-1',
      order_number: 'ORD-1',
      db_status: 'received',
      ui_status: 'received',
    });

    const { GET } = await import('../../app/api/tenant/orders/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/orders/ord-1'), {
      params: Promise.resolve({ id: 'ord-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('ord-1');
  });
});

describe('PATCH /api/tenant/orders/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('returns 403 for seller_assistant', async () => {
    const { PATCH } = await import('../../app/api/tenant/orders/[id]/cancel/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/orders/ord-1/cancel', {
        method: 'PATCH',
        body: JSON.stringify({ reason: 'other', notes: 'x' }),
      }),
      { params: Promise.resolve({ id: 'ord-1' }) },
    );
    expect(res.status).toBe(403);
  });
});
