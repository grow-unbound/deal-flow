import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();
const getPresignedDownloadUrlMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
}));

vi.mock('@/lib/r2', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) => getPresignedDownloadUrlMock(...args),
}));

let entryResult: { data: unknown; error: unknown };
let docResult: { data: unknown; error: unknown };
const docEqSpy = vi.fn();

function makeEntryQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => entryResult),
  };
}

function makeDocQuery() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((...args: unknown[]) => {
      docEqSpy(...args);
      return query;
    }),
    is: vi.fn(() => query),
    maybeSingle: vi.fn().mockImplementation(async () => docResult),
  };
  return query;
}

const fromMock = vi.fn((table: string) => (table === 'entries' ? makeEntryQuery() : makeDocQuery()));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
  },
}));

import { GET } from '../../app/api/tenant/entries/[id]/documents/[docId]/signed-url/route';

function makeRequest() {
  return new NextRequest('http://localhost/api/tenant/entries/11111111-1111-1111-1111-111111111111/documents/22222222-2222-2222-2222-222222222222/signed-url');
}

function callRoute() {
  return GET(makeRequest(), { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111', docId: '22222222-2222-2222-2222-222222222222' }) });
}

describe('GET /api/tenant/entries/[id]/documents/[docId]/signed-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'seller_admin' });
    canAccessDocumentLocationMock.mockReturnValue(true);
    getPresignedDownloadUrlMock.mockResolvedValue('https://r2.example/signed?exp=1');
    entryResult = {
      data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-1', location_id: null, source_entity_type: 'buyer', source_entity_id: 'buyer-1' },
      error: null,
    };
    docResult = {
      data: { id: '22222222-2222-2222-2222-222222222222', storage_key: 'buyers/buyer-1/personal/shop_image/abc', doc_type: 'shop_image' },
      error: null,
    };
  });

  it('signs a URL when the caller is a seller of the entry\'s own tenant and the doc belongs to the entry\'s buyer', async () => {
    const res = await callRoute();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://r2.example/signed?exp=1');
    expect(getPresignedDownloadUrlMock).toHaveBeenCalledWith('buyers/buyer-1/personal/shop_image/abc');
    // The document lookup must be scoped by the CALLER's verified tenant_id and
    // by the entry's own buyer_id -- never by anything the client could supply.
    expect(docEqSpy).toHaveBeenCalledWith('id', '22222222-2222-2222-2222-222222222222');
    expect(docEqSpy).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(docEqSpy).toHaveBeenCalledWith('buyer_id', 'buyer-1');
  });

  it('returns 403 when the entry belongs to a different tenant than the caller (never trusts a client tenant_id)', async () => {
    entryResult = { data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-OTHER', location_id: null, source_entity_type: 'buyer', source_entity_id: 'buyer-1' }, error: null };

    const res = await callRoute();

    expect(res.status).toBe(403);
    expect(getPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 404 (not a distinguishing error) when the document row does not match this tenant+buyer', async () => {
    docResult = { data: null, error: null };

    const res = await callRoute();

    expect(res.status).toBe(404);
    expect(getPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the entry does not exist', async () => {
    entryResult = { data: null, error: null };

    const res = await callRoute();

    expect(res.status).toBe(404);
    expect(getPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-seller role even with a matching tenant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'buyer_admin' });

    const res = await callRoute();

    expect(res.status).toBe(403);
    expect(getPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: null, sub: null, role: null });

    const res = await callRoute();

    expect(res.status).toBe(401);
    expect(getPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the entry is outside the caller\'s location scope', async () => {
    entryResult = { data: { id: '11111111-1111-1111-1111-111111111111', tenant_id: 'tenant-1', location_id: 'loc-9', source_entity_type: 'buyer', source_entity_id: 'buyer-1' }, error: null };
    canAccessDocumentLocationMock.mockReturnValue(false);

    const res = await callRoute();

    expect(res.status).toBe(403);
    expect(getPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('never signs a URL for a document belonging to a different buyer under the same tenant', async () => {
    // Simulates the row-scoping doing its job: the query is scoped by
    // buyer_id = entry.source_entity_id, so a doc row for a different buyer
    // simply won't be returned by the (mocked) query chain.
    docResult = { data: null, error: null };

    const res = await callRoute();

    expect(res.status).toBe(404);
    expect(docEqSpy).toHaveBeenCalledWith('buyer_id', 'buyer-1');
  });
});
