/**
 * Integration tests for the invite flow.
 * Mocks supabaseAdmin and verifies insert / update / resend behaviour.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();

// Chainable builder returned by .schema().from()
function makeQueryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const builder: Record<string, jest.Mock | jest.Mock[]> = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    ...overrides,
  };
  // Make every method return `builder` itself for chaining, unless mocked to return a value
  Object.keys(builder).forEach((key) => {
    const original = builder[key] as jest.Mock;
    builder[key] = jest.fn((...args) => {
      original(...args);
      return builder;
    });
  });
  return builder;
}

const mockListUsers = jest.fn();
const mockInviteUserByEmail = jest.fn();
const mockGetUserById = jest.fn();
const mockGetUser = jest.fn();

const supabaseAdminMock = {
  auth: {
    admin: {
      listUsers: mockListUsers,
      inviteUserByEmail: mockInviteUserByEmail,
      getUserById: mockGetUserById,
    },
  },
  schema: jest.fn(() => ({
    from: jest.fn(() => makeQueryBuilder()),
  })),
};

const supabaseMock = {
  auth: {
    getUser: mockGetUser,
  },
};

jest.mock('../../lib/supabase', () => ({
  get supabaseAdmin() { return supabaseAdminMock; },
  get supabase() { return supabaseMock; },
}));

jest.mock('../../lib/flags', () => ({
  getFlag: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../lib/posthog-server', () => ({
  getPostHogClient: () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true) }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/team/invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a tenant_users row with is_active = false on successful invite', async () => {
    mockListUsers.mockResolvedValue({ data: { users: [] } });
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-id', email: 'newuser@example.com' } },
      error: null,
    });

    let insertedData: unknown = null;
    const qb = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockImplementation((data) => {
        insertedData = data;
        return Promise.resolve({ error: null });
      }),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabaseAdminMock.schema.mockReturnValue({ from: jest.fn().mockReturnValue(qb) });

    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest({ email: 'newuser@example.com', role: 'seller_assistant' });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(201);
    expect(insertedData).toMatchObject({
      tenant_id: 'tenant-abc',
      user_id: 'new-user-id',
      role: 'seller_assistant',
      is_active: false,
    });
    expect(insertedData).toHaveProperty('invited_at');
  });

  it('returns 409 when email belongs to an active member', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ id: 'existing-user', email: 'active@example.com' }] },
    });

    const qb = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'row-id', is_active: true },
        error: null,
      }),
    };
    supabaseAdminMock.schema.mockReturnValue({ from: jest.fn().mockReturnValue(qb) });

    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest({ email: 'active@example.com', role: 'seller_assistant' });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('This user is already a member of your workspace.');
  });

  it('returns 403 when caller is seller_assistant', async () => {
    const { POST } = await import('../../../app/api/team/invite/route');
    const req = makeRequest(
      { email: 'newuser@example.com', role: 'seller_assistant' },
      { 'x-verified-role': 'seller_assistant' },
    );
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(403);
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

    let updatedData: unknown = null;
    const qb = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockImplementation((data) => {
        updatedData = data;
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
    expect(updatedData).toMatchObject({ is_active: true });
    expect(updatedData).toHaveProperty('joined_at');
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
        return { eq: jest.fn().mockReturnThis() };
      }),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'row-id', user_id: 'user-xyz', is_active: false, role: 'seller_assistant' },
        error: null,
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
