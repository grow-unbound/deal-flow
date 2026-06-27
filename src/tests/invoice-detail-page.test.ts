import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

type MaybeSingleResult = { data: unknown; error: unknown };

const invoiceRow: Record<string, unknown> = {
  id: 'inv-1',
  tenant_id: 'tenant-1',
  location_id: 'loc-1',
  buyer_id: 'buyer-1',
  order_id: null,
  estimate_id: null,
  invoice_number: 'INV-1',
  version: 1,
  invoice_date: '2026-06-01',
  due_date: '2026-06-15',
  paid_at: null,
  payment_reference: null,
  payment_method: null,
  status: 'draft',
  subtotal: 1000,
  tax_amount: 180,
  total_amount: 1180,
  outstanding_balance: 1180,
  amount_paid: 0,
  discount_flat: 0,
  freight: 0,
  round_off: 0,
  buyer_po_ref: null,
  notes: '',
  sent_channel: null,
  gstin_locked: false,
  hsn_locked: false,
  voided_at: null,
  viewed_at: null,
  viewed_by_name: null,
  last_reminder_at: null,
  intra_state_tax: true,
  sent_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

function chainMaybeSingle(result: MaybeSingleResult) {
  return {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

function chainArray(data: unknown[]) {
  return {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
}

function defaultFromImpl(table: string) {
  if (table === 'invoices') {
    const query = {
      eq: vi.fn((col: string) => {
        if (col === 'id') {
          return {
            is: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...invoiceRow }, error: null }),
            })),
          };
        }
        return query;
      }),
      neq: vi.fn(() => query),
      in: vi.fn(() => query),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...invoiceRow }, error: null }),
    };
    return {
      select: vi.fn(() => query),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  }
  if (table === 'buyers') {
    return {
      select: vi.fn(() =>
        chainMaybeSingle({
          data: {
            id: 'buyer-1',
            business_name: 'Acme',
            contact_name: null,
            gstin: null,
            geography: {},
            credit_limit: 100000,
            payment_terms_days: 30,
          },
          error: null,
        }),
      ),
    };
  }
  if (table === 'tenants') {
    return {
      select: vi.fn(() =>
        chainMaybeSingle({
          data: {
            business_name: 'Tenant Co',
            gstin: null,
            primary_state: 'ka',
            settings: { payment_instructions: 'Pay', inventory_hold_point: 'invoice' },
          },
          error: null,
        }),
      ),
    };
  }
  if (table === 'locations') {
    return {
      select: vi.fn(() =>
        chainMaybeSingle({
          data: { name: 'Mumbai HQ' },
          error: null,
        }),
      ),
    };
  }
  if (table === 'invoice_items') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => chainArray([])),
        })),
      })),
    };
  }
  if (table === 'payments') {
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };
  }
  if (table === 'audit_log') {
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
  }
  return {
    select: vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      is: vi.fn(() => chainArray([])),
    })),
  };
}

const fromMock = vi.fn(defaultFromImpl);

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: (table: string) => fromMock(table),
      rpc: (...args: unknown[]) => rpcMock(...args),
    })),
  },
}));

describe('invoice detail API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(defaultFromImpl);
    rpcMock.mockResolvedValue({ error: null });
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('GET returns 401 without tenant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({});
    const { GET } = await import('../../app/api/tenant/invoices/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET returns 403 when invoice tenant mismatches', async () => {
    const badRow = { ...invoiceRow, tenant_id: 'other' };
    fromMock.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: badRow, error: null }),
              })),
            })),
          })),
        };
      }
      return defaultFromImpl(table);
    });
    const { GET } = await import('../../app/api/tenant/invoices/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('GET returns 403 when seller assistant is outside the invoice location scope', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      sub: 'user-1',
      location_ids: ['loc-1'],
    });
    const scopedRow = { ...invoiceRow, location_id: 'loc-2' };
    fromMock.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: scopedRow, error: null }),
              })),
            })),
          })),
        };
      }
      return defaultFromImpl(table);
    });
    const { GET } = await import('../../app/api/tenant/invoices/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('PATCH send calls reserve_inventory when hold point is invoice', async () => {
    const { PATCH } = await import('../../app/api/tenant/invoices/[id]/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/invoices/inv-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'send' }),
      }),
      { params: Promise.resolve({ id: 'inv-1' }) },
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('reserve_inventory_for_invoice', { p_invoice_id: 'inv-1' });
  });

  it('GET returns flat InvoiceDetailResponse', async () => {
    const { GET } = await import('../../app/api/tenant/invoices/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/invoices/inv-1'), {
      params: Promise.resolve({ id: 'inv-1' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.doc_number).toBe('INV-1');
    expect(json.totals?.grand_total).toBe(1180);
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.viewer_role).toBe('seller_admin');
    expect(Array.isArray(json.payments)).toBe(true);
  });
});

describe('invoice pay / void / remind API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('PATCH pay applies partial payment', async () => {
    const paidRow = {
      ...invoiceRow,
      status: 'sent',
      due_date: '2026-08-01',
      total_amount: 1180,
      outstanding_balance: 500,
      amount_paid: 680,
    };
    fromMock.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: paidRow, error: null }),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
        };
      }
      if (table === 'audit_log' || table === 'payments') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return defaultFromImpl(table);
    });
    const { PATCH } = await import('../../app/api/tenant/invoices/[id]/pay/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/invoices/inv-1/pay', {
        method: 'PATCH',
        body: JSON.stringify({ amount: 200, payment_method: 'UPI', payment_reference: 'ref-1' }),
      }),
      { params: Promise.resolve({ id: 'inv-1' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.amount_paid).toBe(880);
    expect(json.data.outstanding_balance).toBe(300);
  });

  it('PATCH void requires seller_admin', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      sub: 'user-1',
    });
    const { PATCH } = await import('../../app/api/tenant/invoices/[id]/void/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/invoices/inv-1/void', {
        method: 'PATCH',
        body: JSON.stringify({ confirmed: true }),
      }),
      { params: Promise.resolve({ id: 'inv-1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('PATCH remind updates last_reminder_at', async () => {
    const sentRow = { ...invoiceRow, status: 'sent', due_date: '2026-08-01' };
    fromMock.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: sentRow, error: null }),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
        };
      }
      if (table === 'audit_log') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return defaultFromImpl(table);
    });
    const { PATCH } = await import('../../app/api/tenant/invoices/[id]/remind/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/tenant/invoices/inv-1/remind', {
        method: 'PATCH',
        body: JSON.stringify({ message: 'Ping' }),
      }),
      { params: Promise.resolve({ id: 'inv-1' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.last_reminder_at).toBeTruthy();
  });
});

describe('GET /api/tenant/invoices/[id]/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'inv-1', tenant_id: 'tenant-1', invoice_number: 'INV-1', status: 'void' },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      return defaultFromImpl(table);
    });
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('returns application/pdf (stub path when edge unavailable)', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    try {
      const { GET } = await import('../../app/api/tenant/invoices/[id]/pdf/route');
      const res = await GET(new NextRequest('http://localhost/api/tenant/invoices/inv-1/pdf'), {
        params: Promise.resolve({ id: 'inv-1' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/pdf');
    } finally {
      if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey) process.env.SUPABASE_SERVICE_KEY = prevKey;
    }
  });
});
