import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
}));

let entryResult: { data: unknown; error: unknown };
let docsResult: { data: unknown; error: unknown };

function makeEntryQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => entryResult),
  };
}

function makeDocsQuery() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn().mockImplementation(async () => docsResult),
  };
  return query;
}

const fromMock = vi.fn((table: string) => (table === 'entries' ? makeEntryQuery() : makeDocsQuery()));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
  },
}));

import { GET } from '../../app/api/tenant/entries/[id]/documents/route';

function makeRequest() {
  return new NextRequest('http://localhost/api/tenant/entries/11111111-1111-1111-1111-111111111111/documents');
}

describe('GET /api/tenant/entries/[id]/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'seller_admin' });
    canAccessDocumentLocationMock.mockReturnValue(true);
    entryResult = {
      data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-1', location_id: null, source_entity_type: 'buyer', source_entity_id: 'buyer-1' },
      error: null,
    };
    docsResult = {
      data: [{ id: '22222222-2222-2222-2222-222222222222', doc_type: 'shop_image', subject_scope: 'personal', uploaded_at: '2026-09-01T00:00:00Z', verified_at: null }],
      error: null,
    };
  });

  it('returns the buyer\'s documents without a signed url', async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.documents).toEqual([
      { id: '22222222-2222-2222-2222-222222222222', doc_type: 'shop_image', subject_scope: 'personal', uploaded_at: '2026-09-01T00:00:00Z', verified: false },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/http/);
  });

  it('returns 403 when the entry belongs to a different tenant than the caller', async () => {
    entryResult = { data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-OTHER', location_id: null, source_entity_type: 'buyer', source_entity_id: 'buyer-1' }, error: null };

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });

    expect(res.status).toBe(403);
  });

  it('returns 404 when the entry does not exist', async () => {
    entryResult = { data: null, error: null };

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });

    expect(res.status).toBe(404);
  });

  it('returns 403 when the caller is not a seller role', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'buyer_admin' });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });

    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: null, sub: null, role: null });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });

    expect(res.status).toBe(401);
  });

  it('returns 403 when the entry is outside the caller\'s location scope', async () => {
    entryResult = { data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-1', location_id: 'loc-9', source_entity_type: 'buyer', source_entity_id: 'buyer-1' }, error: null };
    canAccessDocumentLocationMock.mockReturnValue(false);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });

    expect(res.status).toBe(403);
  });
});
