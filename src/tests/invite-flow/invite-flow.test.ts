/**
 * Integration tests for the invite flow.
 * Mocks supabaseAdmin and verifies insert / update / resend behaviour.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type TenantUsersRow = {
  id: string;
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: 'seller_admin' | 'seller_assistant';
  location_ids?: string[] | null;
  is_active: boolean;
  invited_at: string | null;
  joined_at: string | null;
};

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

const mockUpdateUserById = vi.fn();
const mockGetRouteUser = vi.fn();
const mockEnsureSellerAuthIdentity = vi.fn();
const mockSendSellerTeamActivationInvite = vi.fn();

const supabaseAdminMock = {
  auth: {
    admin: {
      updateUserById: mockUpdateUserById,
    },
  },
  schema: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: vi.fn(),
    })),
  })),
};

vi.mock('../../lib/supabase', () => ({
  get supabaseAdmin() {
    return supabaseAdminMock;
  },
}));

vi.mock('../../lib/flags', () => ({
  getFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/posthog-server', () => ({
  getPostHogClient: () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('../../lib/server/seller-team-activation', () => ({
  ensureSellerAuthIdentity: (...args: unknown[]) => mockEnsureSellerAuthIdentity(...args),
  sendSellerTeamActivationInvite: (...args: unknown[]) => mockSendSellerTeamActivationInvite(...args),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetRouteUser,
    },
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => undefined })),
}));

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: {
      get: (key: string) =>
        ({
          'x-verified-tenant-id': 'tenant-abc',
          'x-verified-role': 'seller_admin',
          'x-verified-buyer-id': null,
          ...headers,
        }[key] ?? null),
    },
  };
}

function mockDirectoryQuery(rows: TenantUsersRow[]) {
  mockSelect.mockImplementationOnce(() => ({
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }));
}

function mockTenantLookup(businessName: string) {
  mockSelect.mockImplementationOnce(() => ({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { business_name: businessName },
        error: null,
      }),
    }),
  }));
}

function mockMemberLookup(row: TenantUsersRow | null) {
  mockSelect.mockImplementationOnce(() => ({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
      }),
    }),
  }));
}

function mockInsertChain() {
  mockInsert.mockResolvedValue({ error: null });
}

function mockLocationValidation(ids: string[]) {
  mockSelect.mockImplementationOnce(() => ({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: ids.map((id) => ({ id })),
          error: null,
        }),
      }),
    }),
  }));
}

describe('POST /api/team/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a tenant_users row with invited metadata on successful invite', async () => {
    mockDirectoryQuery([]);
    mockLocationValidation(['loc-1']);
    mockEnsureSellerAuthIdentity.mockResolvedValue({ userId: 'new-user-id' });
    mockSendSellerTeamActivationInvite.mockResolvedValue(undefined);

    let insertedData: unknown = null;
    mockInsert.mockImplementationOnce((data) => {
      insertedData = data;
      return Promise.resolve({ error: null });
    });
    mockTenantLookup('Acme Traders');

    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest({
      full_name: 'New User',
      email: 'newuser@example.com',
      phone: '9876543210',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(201);
    expect(mockEnsureSellerAuthIdentity).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      fullName: 'New User',
      phone: '9876543210',
      tenantId: 'tenant-abc',
    });
    expect(mockSendSellerTeamActivationInvite).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      tenantName: 'Acme Traders',
      fullName: 'New User',
      phone: '9876543210',
    });
    expect(insertedData).toMatchObject({
      tenant_id: 'tenant-abc',
      user_id: 'new-user-id',
      full_name: 'New User',
      email: 'newuser@example.com',
      phone: '9876543210',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
      is_active: false,
    });
    expect(insertedData).toHaveProperty('invited_at');
  });

  it('returns 409 when email is already used within the tenant', async () => {
    mockDirectoryQuery([
      {
        id: 'row-id',
        user_id: 'existing-user',
        email: 'active@example.com',
        phone: '9876543210',
        role: 'seller_admin',
        is_active: true,
        invited_at: null,
        joined_at: '2026-05-01T00:00:00.000Z',
      },
    ]);

    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest({
      full_name: 'Existing User',
      email: 'active@example.com',
      phone: '9123456780',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.fieldErrors.email).toBeDefined();
  });

  it('returns 409 when phone number is already used within the tenant', async () => {
    mockDirectoryQuery([
      {
        id: 'row-id',
        user_id: 'existing-user',
        email: 'someone@company.com',
        phone: '9876543210',
        role: 'seller_admin',
        is_active: true,
        invited_at: null,
        joined_at: '2026-05-01T00:00:00.000Z',
      },
    ]);

    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest({
      full_name: 'Another User',
      email: 'another@company.com',
      phone: '9876543210',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.fieldErrors.phone).toBeDefined();
  });

  it('returns the feature flag error when onboarding is disabled', async () => {
    const flags = await import('../../lib/flags');
    vi.mocked(flags.getFlag).mockResolvedValueOnce(false);

    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest({
      full_name: 'New User',
      email: 'newuser@example.com',
      phone: '9876543210',
      role: 'seller_assistant',
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Feature not enabled');
  });

  it('returns 403 when caller is seller_assistant', async () => {
    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest(
      {
        full_name: 'New User',
        email: 'newuser@example.com',
        phone: '9876543210',
        role: 'seller_assistant',
        location_ids: ['loc-1'],
      },
      { 'x-verified-role': 'seller_assistant' },
    );
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/team/members/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the auth profile and tenant role', async () => {
    mockMemberLookup({
      id: 'row-id',
      user_id: 'user-xyz',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
      is_active: true,
      invited_at: null,
      joined_at: null,
    });
    mockDirectoryQuery([]);
    mockLocationValidation(['loc-2']);
    mockUpdateUserById.mockResolvedValue({ error: null });

    let updatedData: unknown = null;
    mockUpdate.mockImplementationOnce((data) => {
      updatedData = data;
      return {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    const { PUT } = await import('../../../app/api/team/members/[id]/route');
    const req = makeRequest({
      full_name: 'Updated Name',
      email: 'updated@example.com',
      phone: '9123456780',
      role: 'seller_admin',
      location_ids: null,
    });
    const res = await PUT(req as unknown as import('next/server').NextRequest, {
      params: Promise.resolve({ id: 'row-id' }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith(
      'user-xyz',
      expect.objectContaining({
        email: 'updated@example.com',
        user_metadata: {
          full_name: 'Updated Name',
          phone: '9123456780',
        },
      }),
    );
    expect(updatedData).toMatchObject({ role: 'seller_admin', location_ids: null });
  });

  it('returns 409 on duplicate email or phone in the tenant', async () => {
    const tenantUsersQb = {
      select: vi.fn().mockImplementation((columns?: string) => {
        if (columns?.includes('id, user_id, role, location_ids, is_active')) {
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'row-id',
                    user_id: 'user-xyz',
                    role: 'seller_assistant',
                    location_ids: ['loc-1'],
                    is_active: true,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'other-row',
                user_id: 'other-user',
                email: 'updated@example.com',
                phone: '9123456780',
                role: 'seller_admin',
                is_active: true,
                invited_at: null,
                joined_at: null,
              },
            ],
            error: null,
          }),
        };
      }),
    };
    supabaseAdminMock.schema.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'tenant_users') {
          return tenantUsersQb;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const { PUT } = await import('../../../app/api/team/members/[id]/route');
    const req = makeRequest({
      full_name: 'Updated Name',
      email: 'updated@example.com',
      phone: '9123456780',
      role: 'seller_admin',
      location_ids: null,
    });
    const res = await PUT(req as unknown as import('next/server').NextRequest, {
      params: Promise.resolve({ id: 'row-id' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.fieldErrors.email).toBeDefined();
    expect(body.fieldErrors.phone).toBeDefined();
  });

  it('rejects assistant updates without locations', async () => {
    mockMemberLookup({
      id: 'row-id',
      user_id: 'user-xyz',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
      is_active: true,
      invited_at: null,
      joined_at: null,
    });

    const { PUT } = await import('../../../app/api/team/members/[id]/route');
    const req = makeRequest({
      full_name: 'Updated Name',
      email: 'updated@example.com',
      phone: '9123456780',
      role: 'seller_assistant',
      location_ids: [],
    });
    const res = await PUT(req as unknown as import('next/server').NextRequest, {
      params: Promise.resolve({ id: 'row-id' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/accept-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets is_active = true and joined_at when pending row found', async () => {
    mockGetRouteUser.mockResolvedValue({
      data: { user: { id: 'user-xyz' } },
      error: null,
    });

    const qb = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockImplementation((data) => {
        return { eq: vi.fn().mockReturnThis() };
      }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'row-id', tenant_id: 'tenant-abc', role: 'seller_assistant' },
        error: null,
      }),
    };
    supabaseAdminMock.schema.mockReturnValue({ from: vi.fn().mockReturnValue(qb) });

    const { POST } = await import('../../../app/api/auth/accept-invite/route');
    const res = await POST({} as import('next/server').NextRequest);

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/team/members/[id]/resend-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resends the WhatsApp invite and updates invited_at', async () => {
    mockSendSellerTeamActivationInvite.mockResolvedValue(undefined);

    let updatedData: unknown = null;
    const tenantUsersQb = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockImplementation((data) => {
        updatedData = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'row-id',
              user_id: 'user-xyz',
              is_active: false,
              role: 'seller_assistant',
              full_name: 'Pending User',
              phone: '9876543210',
            },
            error: null,
          }),
        }),
      }),
    };
    const tenantsQb = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { business_name: 'Acme Traders' },
          error: null,
        }),
      }),
    };
    supabaseAdminMock.schema.mockReturnValue({
      from: vi.fn((table: string) => (table === 'tenant_users' ? tenantUsersQb : tenantsQb)),
    });

    const { PUT } = await import('../../../app/api/team/members/[id]/resend-invite/route');
    const req = makeRequest(null);
    const res = await PUT(req as unknown as import('next/server').NextRequest, {
      params: Promise.resolve({ id: 'row-id' }),
    });

    expect(res.status).toBe(200);
    expect(mockSendSellerTeamActivationInvite).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      tenantName: 'Acme Traders',
      fullName: 'Pending User',
      phone: '9876543210',
    });
    expect(updatedData).toHaveProperty('invited_at');
  });
});
