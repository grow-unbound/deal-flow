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
            in: vi.fn(() => ({
              is: vi.fn(async () => ({ data: [], error: null })),
            })),
            is: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
              single: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('buyer me route', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
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
      buyer: {
        id: 'buyer-1',
        tenant_id: 'tenant-1',
        business_name: 'Rajan Wine Merchants',
        contact_name: 'Rajan Mehta',
        credit_limit: 250000,
        phone: '9876543210',
        buyer_app_enabled: true,
      },
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
  });
});
