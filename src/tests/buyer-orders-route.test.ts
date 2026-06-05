import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBuyerAppContextMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getBuyerAppContext: (...args: unknown[]) => getBuyerAppContextMock(...args),
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
    getBuyerAppContextMock.mockReset();
  });

  it('returns the preview empty-state message in preview mode', async () => {
    getBuyerAppContextMock.mockResolvedValue({
      sub: 'seller-1',
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      buyer_id: null,
      mode: 'preview',
      share_token: 'tok',
      preview: { tenant_id: 'tenant-1', role: 'buyer_admin', share_token: 'tok', exp: 9999999999, iat: 1, typ: 'buyer_preview_v1' },
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
