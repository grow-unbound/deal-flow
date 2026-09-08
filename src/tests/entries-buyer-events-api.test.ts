import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
  },
}));
vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
}));

import { GET } from '../../app/api/tenant/entries/buyer/[buyerId]/events/route';

describe('GET /api/tenant/entries/buyer/[buyerId]/events', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    rpcMock.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: null, sub: null });
    const req = new NextRequest('http://localhost/api/tenant/entries/buyer/b1/events');
    const res = await GET(req, { params: Promise.resolve({ buyerId: 'b1' }) });
    expect(res.status).toBe(401);
  });

  it('returns events for the authenticated seller tenant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 't1', sub: 'u1', role: 'seller_admin' });
    rpcMock.mockResolvedValue({ data: [{ id: 'e1', entry_id: 'en1', entry_type: 'invoice_overdue', action: 'send_reminder', from_status: 'new', to_status: 'opened', note: null, actor_id: 'u1', created_at: '2026-08-01T00:00:00Z' }], error: null });
    const req = new NextRequest('http://localhost/api/tenant/entries/buyer/b1/events');
    const res = await GET(req, { params: Promise.resolve({ buyerId: 'b1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe('send_reminder');
  });
});
