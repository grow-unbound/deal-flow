import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();
const queueApprovalResolutionMessageMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: (...args: unknown[]) => fromMock(...args),
      rpc: (...args: unknown[]) => rpcMock(...args),
    }),
  },
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
}));

vi.mock('@/lib/server/buyer-approval-notify', () => ({
  queueApprovalResolutionMessage: (...args: unknown[]) => queueApprovalResolutionMessageMock(...args),
}));

import { POST } from '../../app/api/tenant/entries/[id]/actions/route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/tenant/entries/entry-1/actions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/tenant/entries/[id]/actions — approval actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'seller_admin' });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'entry-1', tenant_id: 'tenant-1', location_id: null },
        error: null,
      }),
    });
    canAccessDocumentLocationMock.mockReturnValue(true);
    queueApprovalResolutionMessageMock.mockResolvedValue(true);
  });

  it('accepts approve/decline/request_more_info as valid actions and forwards them to apply_entry_action', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'entry-1', source_entity_type: 'buyer', source_entity_id: 'buyer-1', metadata: {} },
      error: null,
    });

    const res = await POST(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: 'entry-1' }) });

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('apply_entry_action', expect.objectContaining({ p_action: 'approve' }));
  });

  it('rejects an action outside the allowed enum before hitting the RPC', async () => {
    const res = await POST(makeRequest({ action: 'not_a_real_action' }), { params: Promise.resolve({ id: 'entry-1' }) });

    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls queueApprovalResolutionMessage with resolution "approved" and the buyer id from the RPC response', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'entry-1', source_entity_type: 'buyer', source_entity_id: 'buyer-42', metadata: {} },
      error: null,
    });

    await POST(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: 'entry-1' }) });

    expect(queueApprovalResolutionMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'buyer-42',
      'approved',
      { missingFields: undefined },
    );
  });

  it('calls queueApprovalResolutionMessage with "declined" for the decline action', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'entry-1', source_entity_type: 'buyer', source_entity_id: 'buyer-42', metadata: {} },
      error: null,
    });

    await POST(
      makeRequest({ action: 'decline', note: 'GST mismatch' }),
      { params: Promise.resolve({ id: 'entry-1' }) },
    );

    expect(queueApprovalResolutionMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'buyer-42',
      'declined',
      { missingFields: undefined },
    );
  });

  it('reads missing_fields back from the RPC response metadata for request_more_info, not the request body', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'entry-1',
        source_entity_type: 'buyer',
        source_entity_id: 'buyer-42',
        metadata: { missing_fields: ['gst_certificate', 'address'] },
      },
      error: null,
    });

    await POST(
      makeRequest({ action: 'request_more_info', metadata: { missing_fields: ['this_should_be_ignored'] } }),
      { params: Promise.resolve({ id: 'entry-1' }) },
    );

    expect(queueApprovalResolutionMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'buyer-42',
      'needs_more_info',
      { missingFields: ['gst_certificate', 'address'] },
    );
  });

  it('does not call queueApprovalResolutionMessage for a non-approval action', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'entry-1', source_entity_type: 'buyer', source_entity_id: 'buyer-42', metadata: {} },
      error: null,
    });

    await POST(makeRequest({ action: 'start' }), { params: Promise.resolve({ id: 'entry-1' }) });

    expect(queueApprovalResolutionMessageMock).not.toHaveBeenCalled();
  });

  it('still returns success when the notify call throws (non-critical, fire-and-forget)', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'entry-1', source_entity_type: 'buyer', source_entity_id: 'buyer-42', metadata: {} },
      error: null,
    });
    queueApprovalResolutionMessageMock.mockRejectedValue(new Error('whatsapp outage'));

    const res = await POST(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: 'entry-1' }) });

    expect(res.status).toBe(200);
  });

  it('maps approval_buyer_not_found to a distinct, accurate error instead of the generic "Entry not found"', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'approval_buyer_not_found' } });

    const res = await POST(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: 'entry-1' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).not.toBe('Entry not found');
    expect(queueApprovalResolutionMessageMock).not.toHaveBeenCalled();
  });

  it('still maps a genuine entry_not_found RPC error to 404', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'entry_not_found' } });

    const res = await POST(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: 'entry-1' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Entry not found');
  });
});
