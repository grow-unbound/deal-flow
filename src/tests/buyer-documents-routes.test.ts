import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBuyerAccessProfileMock = vi.fn();
const signBuyerDocumentUploadMock = vi.fn();
const buyerDocumentObjectExistsMock = vi.fn();
const getUserMock = vi.fn();
const getUserByIdMock = vi.fn();
const copyObjectMock = vi.fn();

const dbState = {
  buyerDocuments: [] as Array<Record<string, unknown>>,
  buyers: [] as Array<{ id: string; phone: string | null }>,
  nextId: 1,
  rpcResult: { found: false, tenant_name: null, document_ids: [] as string[] },
};

function insertedRow(payload: Record<string, unknown>) {
  const row = { id: `doc-${dbState.nextId++}`, ...payload };
  dbState.buyerDocuments.push(row);
  return row;
}

function createAdminQueryBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  let insertPayload: Record<string, unknown> | null = null;

  const builder: Record<string, any> = {
    select: () => builder,
    insert: (payload: Record<string, unknown>) => {
      insertPayload = payload;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    in: (column: string, value: unknown[]) => {
      filters[column] = value;
      return builder;
    },
    is: () => builder,
    single: async () => {
      if (table === 'buyer_documents' && insertPayload) {
        const row = insertedRow(insertPayload);
        return { data: { id: row.id }, error: null };
      }
      return { data: null, error: { message: 'not found' } };
    },
    then: (resolve: (value: { data: unknown; error: null }) => void) => {
      if (table === 'buyer_documents') {
        const ids = (filters['id'] as string[] | undefined) ?? [];
        const rows = dbState.buyerDocuments.filter((row) => ids.includes(row.id as string));
        resolve({ data: rows, error: null });
        return;
      }
      if (table === 'buyers') {
        const ids = (filters['id'] as string[] | undefined) ?? [];
        const rows = dbState.buyers.filter((row) => ids.includes(row.id));
        resolve({ data: rows, error: null });
        return;
      }
      resolve({ data: [], error: null });
    },
  };

  return builder;
}

vi.mock('@/lib/server/buyer-access', () => ({
  requireBuyerAccessProfile: (...args: unknown[]) => requireBuyerAccessProfileMock(...args),
}));

vi.mock('@/lib/server/buyer-document-presign', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/buyer-document-presign')>(
    '@/lib/server/buyer-document-presign',
  );
  return {
    ...actual,
    signBuyerDocumentUpload: (...args: unknown[]) => signBuyerDocumentUploadMock(...args),
    buyerDocumentObjectExists: (...args: unknown[]) => buyerDocumentObjectExistsMock(...args),
  };
});

vi.mock('@/lib/r2', () => ({
  copyObject: (...args: unknown[]) => copyObjectMock(...args),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => getUserMock() },
    schema: () => ({
      rpc: async () => ({ data: dbState.rpcResult, error: null }),
    }),
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => createAdminQueryBuilder(table)),
      rpc: vi.fn(async () => ({ data: dbState.rpcResult, error: null })),
    })),
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => getUserByIdMock(...args),
      },
    },
  },
}));

const pendingProfile = (overrides: Record<string, unknown> = {}) => ({
  context: {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    role: 'buyer_pending',
    buyer_id: 'buyer-1',
    location_ids: null,
    mode: 'buyer',
    share_token: null,
    preview: null,
  },
  buyer: { id: 'buyer-1', tenant_id: 'tenant-1', business_name: 'Test Buyer' },
  tenant: { id: 'tenant-1', business_name: 'Tenant One', slug: 'tenant-one' },
  greeting_name: 'Test',
  ...overrides,
});

describe('buyer document routes', () => {
  beforeEach(() => {
    requireBuyerAccessProfileMock.mockReset();
    signBuyerDocumentUploadMock.mockReset();
    buyerDocumentObjectExistsMock.mockReset();
    getUserMock.mockReset();
    getUserByIdMock.mockReset();
    copyObjectMock.mockReset();
    dbState.buyerDocuments = [];
    dbState.buyers = [];
    dbState.nextId = 1;
    dbState.rpcResult = { found: false, tenant_name: null, document_ids: [] };
  });

  describe('POST /api/buyer/documents/presign', () => {
    it('rejects a session that is not buyer_pending/buyer_admin', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(
        pendingProfile({ context: { ...pendingProfile().context, role: 'buyer_assistant' } }),
      );
      const { POST } = await import('../../app/api/buyer/documents/presign/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/presign', {
          method: 'POST',
          body: JSON.stringify({ scope: 'personal', doc_type: 'shop_image', content_type: 'image/png' }),
        }) as any,
      );
      expect(response.status).toBe(401);
    });

    it('rejects business scope without a gstin', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      const { POST } = await import('../../app/api/buyer/documents/presign/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/presign', {
          method: 'POST',
          body: JSON.stringify({ scope: 'business', doc_type: 'gst_certificate', content_type: 'application/pdf' }),
        }) as any,
      );
      expect(response.status).toBe(422);
    });

    it('derives buyerId from the session, never the body, and returns the signed URL', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      signBuyerDocumentUploadMock.mockResolvedValue({
        key: 'buyers/buyer-1/personal/shop_image/uuid-abc',
        upload_url: 'https://r2.example/signed',
      });

      const { POST } = await import('../../app/api/buyer/documents/presign/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/presign', {
          method: 'POST',
          body: JSON.stringify({
            scope: 'personal',
            doc_type: 'shop_image',
            content_type: 'image/png',
            buyer_id: 'attacker-buyer-id',
          }),
        }) as any,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.upload_url).toBe('https://r2.example/signed');
      expect(signBuyerDocumentUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ buyerId: 'buyer-1', scope: 'personal', docType: 'shop_image' }),
      );
    });
  });

  describe('POST /api/buyer/documents/confirm', () => {
    it('rejects a key that does not match this buyer\'s personal path', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      const { POST } = await import('../../app/api/buyer/documents/confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/confirm', {
          method: 'POST',
          body: JSON.stringify({
            key: 'buyers/someone-elses-buyer/personal/shop_image/uuid-abc',
            doc_type: 'shop_image',
            subject_scope: 'personal',
          }),
        }) as any,
      );
      expect(response.status).toBe(403);
    });

    it('rejects when the object does not exist in R2', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      buyerDocumentObjectExistsMock.mockResolvedValue(false);
      const { POST } = await import('../../app/api/buyer/documents/confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/confirm', {
          method: 'POST',
          body: JSON.stringify({
            key: 'buyers/buyer-1/personal/shop_image/uuid-abc',
            doc_type: 'shop_image',
            subject_scope: 'personal',
          }),
        }) as any,
      );
      expect(response.status).toBe(422);
    });

    it('inserts the row once the object is confirmed to exist', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      buyerDocumentObjectExistsMock.mockResolvedValue(true);
      const { POST } = await import('../../app/api/buyer/documents/confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/confirm', {
          method: 'POST',
          body: JSON.stringify({
            key: 'buyers/buyer-1/personal/shop_image/uuid-abc',
            doc_type: 'shop_image',
            subject_scope: 'personal',
          }),
        }) as any,
      );
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.id).toBeDefined();
      expect(dbState.buyerDocuments).toHaveLength(1);
      expect(dbState.buyerDocuments[0]).toMatchObject({
        tenant_id: 'tenant-1',
        buyer_id: 'buyer-1',
        subject_scope: 'personal',
      });
    });
  });

  describe('POST /api/buyer/documents/reuse-check', () => {
    it('runs the gstin branch via service role without needing a session phone, but marks reuse unavailable', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      dbState.rpcResult = { found: true, tenant_name: 'Other Tenant', document_ids: ['doc-9'] };
      const { POST } = await import('../../app/api/buyer/documents/reuse-check/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-check', {
          method: 'POST',
          body: JSON.stringify({ gstin: '29AAVIC9992H1Z0' }),
        }) as any,
      );
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.found).toBe(true);
      // Business-scope reuse-copy is disabled this round — the existence
      // check still runs (accepted bounded oracle risk) but the response
      // must say the copy step isn't actionable.
      expect(body.reuse_available).toBe(false);
    });

    it('normalizes GSTIN case before calling the RPC', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      dbState.rpcResult = { found: true, tenant_name: 'Other Tenant', document_ids: ['doc-9'] };
      const rpcMock = vi.fn(async (...args: unknown[]) => {
        const params = args[1] as { p_gstin: string; p_phone: string | null };
        expect(params.p_gstin).toBe('29AAVIC9992H1Z0');
        return { data: dbState.rpcResult, error: null };
      });
      const { supabaseAdmin } = await import('@/lib/supabase');
      (supabaseAdmin!.schema as any).mockReturnValueOnce({
        rpc: rpcMock,
        from: vi.fn((table: string) => createAdminQueryBuilder(table)),
      });

      const { POST } = await import('../../app/api/buyer/documents/reuse-check/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-check', {
          method: 'POST',
          body: JSON.stringify({ gstin: '29aavic9992h1z0' }),
        }) as any,
      );
      expect(response.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith(
        'check_document_reuse_candidate',
        expect.objectContaining({ p_gstin: '29AAVIC9992H1Z0' }),
      );
    });

    it('returns not-found when there is no otp_verified_phone on the session', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      getUserMock.mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null });
      const { POST } = await import('../../app/api/buyer/documents/reuse-check/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-check', {
          method: 'POST',
          body: JSON.stringify({}),
        }) as any,
      );
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.found).toBe(false);
    });
  });

  describe('POST /api/buyer/documents/reuse-confirm', () => {
    it('rejects consent !== true', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      const { POST } = await import('../../app/api/buyer/documents/reuse-confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-confirm', {
          method: 'POST',
          body: JSON.stringify({ document_ids: ['00000000-0000-0000-0000-000000000001'], consent: false }),
        }) as any,
      );
      expect(response.status).toBe(422);
    });

    it('rejects reusing a personal document whose owner phone does not match the session phone', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      dbState.buyerDocuments.push({
        id: '00000000-0000-0000-0000-000000000002',
        tenant_id: 'tenant-2',
        buyer_id: 'other-buyer',
        gstin: null,
        doc_type: 'shop_image',
        subject_scope: 'personal',
        storage_key: 'buyers/other-buyer/personal/shop_image/uuid-xyz',
      });
      dbState.buyers.push({ id: 'other-buyer', phone: '9990000001' });
      getUserByIdMock.mockResolvedValue({
        data: { user: { user_metadata: { otp_verified_phone: '9990000002' } } },
        error: null,
      });

      const { POST } = await import('../../app/api/buyer/documents/reuse-confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-confirm', {
          method: 'POST',
          body: JSON.stringify({
            document_ids: ['00000000-0000-0000-0000-000000000002'],
            consent: true,
          }),
        }) as any,
      );
      expect(response.status).toBe(403);
      expect(copyObjectMock).not.toHaveBeenCalled();
    });

    it('rejects the whole request when any requested document is business-scope, and never copies', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      dbState.buyerDocuments.push(
        {
          id: '00000000-0000-0000-0000-000000000004',
          tenant_id: 'tenant-2',
          buyer_id: 'other-buyer',
          gstin: null,
          doc_type: 'shop_image',
          subject_scope: 'personal',
          storage_key: 'buyers/other-buyer/personal/shop_image/uuid-personal',
        },
        {
          id: '00000000-0000-0000-0000-000000000005',
          tenant_id: 'tenant-2',
          buyer_id: 'other-buyer',
          gstin: '29AAVIC9992H1Z0',
          doc_type: 'gst_certificate',
          subject_scope: 'business',
          storage_key: 'businesses/somehash/docs/gst_certificate/uuid-biz',
        },
      );
      dbState.buyers.push({ id: 'other-buyer', phone: '9990000002' });
      getUserByIdMock.mockResolvedValue({
        data: { user: { user_metadata: { otp_verified_phone: '9990000002' } } },
        error: null,
      });

      const { POST } = await import('../../app/api/buyer/documents/reuse-confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-confirm', {
          method: 'POST',
          body: JSON.stringify({
            // mixed request: one personal id (would otherwise succeed) + one business id
            document_ids: [
              '00000000-0000-0000-0000-000000000004',
              '00000000-0000-0000-0000-000000000005',
            ],
            consent: true,
          }),
        }) as any,
      );
      const body = await response.json();
      expect(response.status).toBe(403);
      expect(body.error).toBe('business_document_reuse_not_available');
      expect(copyObjectMock).not.toHaveBeenCalled();
      expect(dbState.buyerDocuments).toHaveLength(2); // no new row inserted
    });

    it('copies the object and inserts a new row pointing at the source when the phone matches', async () => {
      requireBuyerAccessProfileMock.mockResolvedValue(pendingProfile());
      dbState.buyerDocuments.push({
        id: '00000000-0000-0000-0000-000000000003',
        tenant_id: 'tenant-2',
        buyer_id: 'other-buyer',
        gstin: null,
        doc_type: 'shop_image',
        subject_scope: 'personal',
        storage_key: 'buyers/other-buyer/personal/shop_image/uuid-xyz',
      });
      dbState.buyers.push({ id: 'other-buyer', phone: '9990000002' });
      getUserByIdMock.mockResolvedValue({
        data: { user: { user_metadata: { otp_verified_phone: '9990000002' } } },
        error: null,
      });

      const { POST } = await import('../../app/api/buyer/documents/reuse-confirm/route');
      const response = await POST(
        new Request('http://localhost/api/buyer/documents/reuse-confirm', {
          method: 'POST',
          body: JSON.stringify({
            document_ids: ['00000000-0000-0000-0000-000000000003'],
            consent: true,
          }),
        }) as any,
      );
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(copyObjectMock).toHaveBeenCalledWith(
        'buyers/other-buyer/personal/shop_image/uuid-xyz',
        expect.stringContaining('buyers/buyer-1/personal/shop_image/'),
      );
      expect(body.document_ids).toHaveLength(1);
      const created = dbState.buyerDocuments.find((row) => row.id === body.document_ids[0]);
      expect(created).toMatchObject({
        buyer_id: 'buyer-1',
        tenant_id: 'tenant-1',
        reused_from_document_id: '00000000-0000-0000-0000-000000000003',
      });
    });
  });
});
