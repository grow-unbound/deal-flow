import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();

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
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [],
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('buyer orders route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
  });

  it('returns the preview empty-state message in preview mode', async () => {
    requireBuyerAccessProfileMock.mockResolvedValue({
      context: {
        sub: 'seller-1',
        tenant_id: 'tenant-1',
        role: 'buyer_admin',
        buyer_id: null,
        mode: 'preview',
        share_token: 'tok',
        preview: { tenant_id: 'tenant-1', role: 'buyer_admin', share_token: 'tok', exp: 9999999999, iat: 1, typ: 'buyer_preview_v1' },
      },
      buyer: null,
      tenant: { id: 'tenant-1', business_name: 'Yukti Demo', slug: 'yukti-demo' },
    });

    const { GET } = await import('../../app/api/buyer/orders/route');
    const response = await GET(new Request('http://localhost/api/buyer/orders') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      mode: 'preview',
      orders: [],
      preview_message: 'Order history for a logged-in buyer will appear here.',
    });
  });
});
