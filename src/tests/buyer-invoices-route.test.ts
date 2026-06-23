import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const gtMock = vi.fn();
const limitMock = vi.fn();

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                gt: gtMock,
                order: vi.fn(() => ({
                  limit: limitMock,
                })),
              })),
            })),
          })),
        })),
      })),
    })),
  },
  supabase: null,
}));

describe('buyer invoices route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    gtMock.mockReset();
    limitMock.mockReset();
    gtMock.mockReturnValue({
      order: vi.fn(() => ({
        limit: limitMock,
      })),
    });
    limitMock.mockResolvedValue({
      data: [
        {
          id: 'inv-1',
          invoice_number: 'INV-001',
          status: 'sent',
          total_amount: 5000,
          outstanding_balance: 2500,
          invoice_date: '2026-06-01',
          due_date: '2026-06-10',
        },
      ],
      error: null,
    });
  });

  it('filters to unpaid invoices when requested', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: { tenant_id: 'tenant-1', mode: 'buyer' },
      buyer: { id: 'buyer-1' },
    });

    const { GET } = await import('../../app/api/buyer/invoices/route');
    const response = await GET({ nextUrl: new URL('http://localhost/api/buyer/invoices?unpaid_only=true') } as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(gtMock).toHaveBeenCalledWith('outstanding_balance', 0);
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0].outstanding_balance).toBe(2500);
  });
});
