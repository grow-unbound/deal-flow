import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const rpcMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();
const loadAccessibleSellerLocationsMock = vi.fn();
const resolveDefaultSellerLocationIdMock = vi.fn();

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

vi.mock('@/lib/server/buyer-credit', () => ({
  loadBuyerCreditSnapshot: vi.fn().mockResolvedValue({
    credit_used: 0,
    available_credit: 500_000,
  }),
  loadBuyerCreditSnapshots: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/server/whatsapp-document-send', () => ({
  getBuyerDocumentSendState: vi.fn().mockResolvedValue({
    can_send: true,
    block_reason: null,
    block_message: null,
    credits_balance: 10,
    required_credits: 1,
    recipient_phone: '9876543210',
    template_name: 'request_update_buyer',
    seller_name: 'Yukti Seller',
    seller_phone_display: '+91 98765 43210',
  }),
}));

const estimateRow: Record<string, unknown> = {
  id: 'est-1',
  tenant_id: 'tenant-1',
  buyer_id: 'buyer-1',
  estimate_number: 'EST-2026-0001',
  status: 'accepted',
  subtotal: 1000,
  tax_amount: 180,
  total_amount: 1180,
  currency: 'INR',
  notes: null,
  seller_note: null,
  expires_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-06-01T00:00:00.000Z',
  sent_at: '2026-06-02T00:00:00.000Z',
  accepted_at: '2026-06-03T00:00:00.000Z',
  converted_to_order_id: null,
  converted_to_invoice_id: null,
  campaign_id: null,
};

function defaultFromImpl(table: string) {
  if (table === 'estimates') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { ...estimateRow }, error: null }),
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
  if (table === 'buyers') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'buyer-1',
                business_name: 'Acme',
                contact_name: 'Priya',
                phone: '9999999999',
                email: 'buyer@example.com',
                gstin: '07AAAAA0000A1Z5',
                geography: { city: 'Delhi', state: 'Delhi', pincode: '110001' },
                credit_limit: 500_000,
                payment_terms_days: 30,
              },
              error: null,
            }),
          })),
        })),
      })),
    };
  }
  if (table === 'invoices') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
    };
  }
  if (table === 'estimate_items') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'ei-1',
                tenant_product_id: 'tp-1',
                qty: 1,
                unit_price: 1000,
                tax_rate: 18,
                line_total: 1000,
                discount_pct: 0,
              },
            ],
            error: null,
          }),
        })),
      })),
    };
  }
  if (table === 'tenant_products') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'tp-1',
                internal_sku: 'SKU-1',
                name_override: null,
                master_product_id: 'mp-1',
                tenant_brand_id: 'tb-1',
              },
            ],
            error: null,
          }),
        })),
      })),
    };
  }
  if (table === 'tenant_brands') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'tb-1', master_brand_id: 'mb-1', display_name_override: null }],
            error: null,
          }),
        })),
      })),
    };
  }
  if (table === 'tenants') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'tenant-1', primary_state: 'Maharashtra' },
            error: null,
          }),
        })),
      })),
    };
  }
  if (table === 'tenant_inventory') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn().mockResolvedValue({
            data: [{ tenant_product_id: 'tp-1', qty_available: 12 }],
            error: null,
          }),
        })),
      })),
    };
  }
  if (table === 'cohort_members') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };
  }
  if (table === 'price_list_assignments') {
    return {
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };
  }
  if (table === 'price_lists') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    };
  }
  if (table === 'audit_log') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };
  }
  return {
    select: vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  };
}

const fromMock = vi.fn(defaultFromImpl);

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schema: string) => {
      if (schema === 'catalog') {
        return {
          from: (table: string) => {
            if (table === 'products') {
              return {
                select: vi.fn(() => ({
                  in: vi.fn().mockResolvedValue({ data: [{ id: 'mp-1', name: 'Widget' }], error: null }),
                })),
              };
            }
            if (table === 'brands') {
              return {
                select: vi.fn(() => ({
                  in: vi.fn().mockResolvedValue({ data: [{ id: 'mb-1', name: 'BrandCo' }], error: null }),
                })),
              };
            }
            return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })) };
          },
        };
      }
      return {
        from: (table: string) => fromMock(table),
        rpc: (...args: unknown[]) => rpcMock(...args),
      };
    }),
  },
}));

describe('GET /api/tenant/estimates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(defaultFromImpl);
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
    canAccessDocumentLocationMock.mockReturnValue(true);
    loadAccessibleSellerLocationsMock.mockResolvedValue([]);
    resolveDefaultSellerLocationIdMock.mockReturnValue(null);
  });

  it('returns 401 without tenant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({});
    const { GET } = await import('../../app/api/tenant/estimates/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/estimates/est-1'), {
      params: Promise.resolve({ id: 'est-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when estimate belongs to another tenant', async () => {
    const bad = { ...estimateRow, tenant_id: 'other-tenant' };
    fromMock.mockImplementation((table: string) => {
      if (table === 'estimates') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: bad, error: null }),
              })),
            })),
          })),
        };
      }
      return defaultFromImpl(table);
    });
    const { GET } = await import('../../app/api/tenant/estimates/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/estimates/est-1'), {
      params: Promise.resolve({ id: 'est-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns payload when tenant matches', async () => {
    const { GET } = await import('../../app/api/tenant/estimates/[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/tenant/estimates/est-1'), {
      params: Promise.resolve({ id: 'est-1' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { estimate_number: string; items: unknown[] } };
    expect(json.data.estimate_number).toBe('EST-2026-0001');
    expect(json.data.items.length).toBe(1);
  });
});

describe('POST /api/tenant/estimates/[id]/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(defaultFromImpl);
    rpcMock.mockResolvedValue({ data: {}, error: null });
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('calls estimate_convert_to_order RPC for convert_order', async () => {
    const { POST } = await import('../../app/api/tenant/estimates/[id]/actions/route');
    const res = await POST(
      new NextRequest('http://localhost/api/tenant/estimates/est-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'convert_order' }),
      }),
      { params: Promise.resolve({ id: 'est-1' }) },
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('estimate_convert_to_order', {
      p_tenant_id: 'tenant-1',
      p_estimate_id: 'est-1',
      p_actor_user_id: 'user-1',
      p_order_date: expect.any(String),
    });
  });

  it('returns 400 for convert_invoice without invoice_date', async () => {
    const { POST } = await import('../../app/api/tenant/estimates/[id]/actions/route');
    const res = await POST(
      new NextRequest('http://localhost/api/tenant/estimates/est-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'convert_invoice' }),
      }),
      { params: Promise.resolve({ id: 'est-1' }) },
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls estimate_convert_to_invoice RPC with invoice_date for convert_invoice', async () => {
    const { POST } = await import('../../app/api/tenant/estimates/[id]/actions/route');
    const res = await POST(
      new NextRequest('http://localhost/api/tenant/estimates/est-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'convert_invoice', invoice_date: '2026-07-08' }),
      }),
      { params: Promise.resolve({ id: 'est-1' }) },
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('estimate_convert_to_invoice', {
      p_tenant_id: 'tenant-1',
      p_estimate_id: 'est-1',
      p_actor_user_id: 'user-1',
      p_invoice_date: '2026-07-08',
    });
  });
});
