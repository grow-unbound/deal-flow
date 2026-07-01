import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSignupTenantSettingsSeed } from '@/lib/tenant-settings/signup-seed';

const getFlagMock = vi.fn();
const seedTenantFeatureFlagsMock = vi.fn();
const createUserMock = vi.fn();
const deleteUserMock = vi.fn();
const updateUserByIdMock = vi.fn();
const rpcMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const refreshSessionMock = vi.fn();
const createClientMock = vi.fn();

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogClient: () => ({
    identify: vi.fn(),
    capture: vi.fn(),
    flush: vi.fn(),
  }),
  seedTenantFeatureFlags: (...args: unknown[]) => seedTenantFeatureFlagsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createUserMock(...args),
        deleteUser: (...args: unknown[]) => deleteUserMock(...args),
        updateUserById: (...args: unknown[]) => updateUserByIdMock(...args),
      },
    },
    schema: () => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    }),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { POST } from '../../../app/api/auth/signup/route';

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    getFlagMock.mockResolvedValue(true);
    createUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: {
        tenant_id: 'tenant-1',
        slug: 'acme-distributors',
        subdomain: 'acme-distributors.yukti.so',
      },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({ error: null });
    deleteUserMock.mockResolvedValue(undefined);
    signInWithPasswordMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      },
      error: null,
    });
    refreshSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'refreshed-access-token',
          refresh_token: 'refreshed-refresh-token',
        },
      },
    });
    createClientMock.mockReturnValue({
      auth: {
        signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
        refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
      },
    });
    seedTenantFeatureFlagsMock.mockResolvedValue(undefined);
  });

  it('seeds tenant_settings from signup contact info and starts all tenant flags off', async () => {
    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Asha',
        email: 'asha@example.com',
        password: 'password123',
        business_name: 'Acme Distributors',
        slug: 'acme-distributors',
        phone: '9876543210',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(rpcMock).toHaveBeenCalledTimes(1);

    const [rpcName, rpcArgs] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('create_tenant_and_admin');
    expect(rpcArgs).toMatchObject({
      p_business_phone: '9876543210',
      p_business_email: 'asha@example.com',
      p_whatsapp_phone: '9876543210',
    });

    expect(rpcArgs.p_initial_settings).toEqual(
      buildSignupTenantSettingsSeed({
        businessName: 'Acme Distributors',
        businessPhone: '9876543210',
        businessEmail: 'asha@example.com',
        whatsappPhone: '9876543210',
      }),
    );
    expect(rpcArgs.p_initial_settings.business.phone).toBe('9876543210');
    expect(rpcArgs.p_initial_settings.business.email).toBe('asha@example.com');
    expect(rpcArgs.p_initial_settings.buyer_app.whatsapp_number).toBe('9876543210');
    expect(rpcArgs.p_initial_settings.delivery_routing_threshold_km).toBe(50);
    expect(rpcArgs.p_initial_settings.orders.features).toMatchObject({
      enquiries: false,
      sales_orders: false,
      invoices: false,
    });
    expect(rpcArgs.p_initial_settings.catalog).toMatchObject({
      price_lists_enabled: false,
      cohort_pricing_enabled: false,
      catalog_publishing_enabled: false,
    });

    expect(seedTenantFeatureFlagsMock).toHaveBeenCalledWith('tenant-1');
  });

  it('still completes signup when tenant flag seeding fails', async () => {
    seedTenantFeatureFlagsMock.mockRejectedValueOnce(new Error('posthog down'));

    const request = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'asha@example.com',
        password: 'password123',
        business_name: 'Acme Distributors',
        slug: 'acme-distributors',
        phone: '9876543210',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });
});
