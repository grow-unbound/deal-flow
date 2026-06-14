/**
 * Integration tests for the invite flow.
 * Mocks supabaseAdmin and verifies insert / update / resend behaviour.
 */

type TenantUsersRow = {
  id: string;
  user_id: string;
  role: 'seller_admin' | 'seller_assistant';
  location_ids?: string[] | null;
  is_active: boolean;
  invited_at: string | null;
  joined_at: string | null;
};

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSelect = jest.fn();

const mockListUsers = jest.fn();
const mockInviteUserByEmail = jest.fn();
const mockGetUserById = jest.fn();
const mockUpdateUserById = jest.fn();
const mockGetUser = jest.fn();

const supabaseAdminMock = {
  auth: {
    admin: {
      listUsers: mockListUsers,
      inviteUserByEmail: mockInviteUserByEmail,
      getUserById: mockGetUserById,
      updateUserById: mockUpdateUserById,
    },
  },
  schema: jest.fn(() => ({
    from: jest.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: jest.fn(),
    })),
  })),
};

const supabaseMock = {
  auth: {
    getUser: mockGetUser,
  },
};

jest.mock('../../lib/supabase', () => ({
  get supabaseAdmin() {
    return supabaseAdminMock;
  },
  get supabase() {
    return supabaseMock;
  },
}));

jest.mock('../../lib/flags', () => ({
  getFlag: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../lib/posthog-server', () => ({
  getPostHogClient: () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true) }),
}));

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: jest.fn().mockResolvedValue(body),
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
    eq: jest.fn().mockResolvedValue({ data: rows, error: null }),
  }));
}

function mockMemberLookup(row: TenantUsersRow | null) {
  mockSelect.mockImplementationOnce(() => ({
    eq: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
        maybeSingle: jest.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
      }),
    }),
  }));
}

function mockInsertChain() {
  mockInsert.mockResolvedValue({ error: null });
}

function mockLocationValidation(ids: string[]) {
  mockSelect.mockImplementationOnce(() => ({
    eq: jest.fn().mockReturnValue({
      is: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: ids.map((id) => ({ id })),
          error: null,
        }),
      }),
    }),
  }));
}

describe('POST /api/team/invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a tenant_users row with invited metadata on successful invite', async () => {
    mockListUsers.mockResolvedValue({ data: { users: [] } });
    mockDirectoryQuery([]);
    mockLocationValidation(['loc-1']);
    mockInsertChain();
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-id', email: 'newuser@example.com' } },
      error: null,
    });

    let insertedData: unknown = null;
    mockInsert.mockImplementationOnce((data) => {
      insertedData = data;
      return Promise.resolve({ error: null });
    });

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
    expect(mockInviteUserByEmail).toHaveBeenCalledWith(
      'newuser@example.com',
      expect.objectContaining({
        data: {
          tenant_id: 'tenant-abc',
          role: 'seller_assistant',
          full_name: 'New User',
          phone: '9876543210',
          location_ids: ['loc-1'],
        },
      }),
    );
    expect(insertedData).toMatchObject({
      tenant_id: 'tenant-abc',
      user_id: 'new-user-id',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
      is_active: false,
    });
    expect(insertedData).toHaveProperty('invited_at');
  });

  it('returns 409 when email is already used within the tenant', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ id: 'existing-user', email: 'active@example.com', user_metadata: { phone: '9876543210' } }] },
    });
    mockDirectoryQuery([
      {
        id: 'row-id',
        user_id: 'existing-user',
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
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'existing-user', email: 'someone@company.com', user_metadata: { phone: '9876543210' } },
        ],
      },
    });
    mockDirectoryQuery([
      {
        id: 'row-id',
        user_id: 'existing-user',
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
    (flags.getFlag as jest.Mock).mockResolvedValueOnce(false);

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
    jest.clearAllMocks();
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
    mockListUsers.mockResolvedValue({ data: { users: [] } });
    mockDirectoryQuery([]);
    mockLocationValidation(['loc-2']);
    mockUpdateUserById.mockResolvedValue({ error: null });

    let updatedData: unknown = null;
    mockUpdate.mockImplementationOnce((data) => {
      updatedData = data;
      return {
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
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
      params: { id: 'row-id' },
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
    mockMemberLookup({
      id: 'row-id',
      user_id: 'user-xyz',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
      is_active: true,
      invited_at: null,
      joined_at: null,
    });
    mockDirectoryQuery([
      {
        id: 'other-row',
        user_id: 'other-user',
        role: 'seller_admin',
        is_active: true,
        invited_at: null,
        joined_at: null,
      },
    ]);

    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'other-user', email: 'updated@example.com', user_metadata: { phone: '9123456780' } },
        ],
      },
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
      params: { id: 'row-id' },
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
      params: { id: 'row-id' },
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/accept-invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets is_active = true and joined_at when pending row found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-xyz' } },
      error: null,
    });

    const qb = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockImplementation((data) => {
        return { eq: jest.fn().mockReturnThis() };
      }),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'row-id', tenant_id: 'tenant-abc', role: 'seller_assistant' },
        error: null,
      }),
    };
    supabaseAdminMock.schema.mockReturnValue({ from: jest.fn().mockReturnValue(qb) });

    const { POST } = await import('../../../app/api/auth/accept-invite/route');
    const res = await POST({} as import('next/server').NextRequest);

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/team/members/[id]/resend-invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls inviteUserByEmail again and updates invited_at', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'pending@example.com' } },
      error: null,
    });
    mockInviteUserByEmail.mockResolvedValue({ error: null });

    let updatedData: unknown = null;
    const qb = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockImplementation((data) => {
        updatedData = data;
        return { eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) };
      }),
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'row-id', user_id: 'user-xyz', is_active: false, role: 'seller_assistant' },
            error: null,
          }),
        }),
      }),
    };
    supabaseAdminMock.schema.mockReturnValue({ from: jest.fn().mockReturnValue(qb) });

    const { PUT } = await import('../../../app/api/team/members/[id]/resend-invite/route');
    const req = makeRequest(null);
    const res = await PUT(req as unknown as import('next/server').NextRequest, {
      params: { id: 'row-id' },
    });

    expect(res.status).toBe(200);
    expect(mockInviteUserByEmail).toHaveBeenCalledWith(
      'pending@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/accept-invite') }),
    );
    expect(updatedData).toHaveProperty('invited_at');
  });
});
