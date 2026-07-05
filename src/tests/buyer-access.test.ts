import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getBuyerAppContextMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getBuyerAppContext: (...args: unknown[]) => getBuyerAppContextMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn((schemaName: string) => {
      if (schemaName !== 'app') {
        throw new Error(`Unexpected schema: ${schemaName}`);
      }

      return {
        from: vi.fn((tableName: string) => {
          if (tableName === 'buyers') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      or: vi.fn(() => ({
                        is: vi.fn(() => ({
                          maybeSingle: vi.fn(async () => ({
                            data: {
                              id: 'buyer-1',
                              tenant_id: 'tenant-1',
                              business_name: 'Rajan Wine Merchants',
                              contact_name: 'Rajan Mehta',
                              credit_limit: 250000,
                              phone: '9876543210',
                              gstin: '07AABCR1234M1Z5',
                              buyer_app_enabled: true,
                            },
                            error: null,
                          })),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }

          if (tableName === 'tenants') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: 'tenant-1',
                      business_name: 'Tenant One',
                      slug: 'tenant-one',
                      settings: { buyer_app: { enabled: true } },
                    },
                    error: null,
                  })),
                })),
              })),
            };
          }

          if (tableName === 'tenant_settings') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      tenant_id: 'tenant-1',
                      settings: { buyer_app: { enabled: true } },
                    },
                    error: null,
                  })),
                })),
              })),
            };
          }

          throw new Error(`Unexpected table: ${tableName}`);
        }),
      };
    }),
  },
}));

describe('requireBuyerAccessProfile', () => {
  beforeEach(() => {
    getBuyerAppContextMock.mockReset();
  });

  it('uses buyer contact details for the greeting name', async () => {
    getBuyerAppContextMock.mockResolvedValue({
      sub: 'seller-user-1',
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      buyer_id: 'buyer-1',
      location_ids: null,
      mode: 'buyer',
      share_token: null,
      preview: null,
    });

    const { requireBuyerAccessProfile } = await import('@/lib/server/buyer-access');
    const profile = await requireBuyerAccessProfile(new NextRequest('http://localhost/buy/home'));

    expect(profile?.greeting_name).toBe('Rajan');
    expect(profile?.buyer?.business_name).toBe('Rajan Wine Merchants');
  });
});
