import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();
const entryMaybeSingle = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: () => true,
  getSellerLocationScope: () => ({ mode: 'all' }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
      from: () => {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.is = () => builder;
        builder.order = () => builder;
        builder.maybeSingle = () => entryMaybeSingle();
        return builder;
      },
    }),
  },
}));

import { GET as getOptions } from '../../app/api/tenant/entries/approval-options/route';
import { GET as getPreview } from '../../app/api/tenant/entries/approval-price-preview/route';
import { GET as getCount } from '../../app/api/tenant/entries/count/route';
import { GET as getBuyerEvents } from '../../app/api/tenant/entries/buyer/[buyerId]/events/route';
import { GET as getDocuments } from '../../app/api/tenant/entries/[id]/documents/route';

const COHORT_ID = '11111111-1111-4111-8111-111111111111';
const PRICE_LIST_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';

const admin = { tenant_id: 'tenant-a', sub: 'admin-1', role: 'seller_admin', location_ids: null };
const assistant = { tenant_id: 'tenant-a', sub: 'asst-1', role: 'seller_assistant', location_ids: ['loc-1'] };

const req = (url: string) => new NextRequest(url, { method: 'GET' }) as any;

describe('approval assignment read routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue(admin);
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  describe('GET approval-options', () => {
    it('returns the RPC payload for an admin, scoped to the verified tenant (never a client tenant)', async () => {
      rpcMock.mockResolvedValue({ data: { cohorts: [], price_lists: [], default_cohort_id: null, zoho_active: false }, error: null });

      const res = await getOptions(req('http://localhost/api/tenant/entries/approval-options?tenant_id=evil'));

      expect(res.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith('get_approval_assignment_options', {
        p_tenant_id: 'tenant-a',
        p_actor_user_id: 'admin-1',
      });
      expect(res.headers.get('Cache-Control')).toContain('private');
    });

    it('forbids seller_assistant without touching the DB', async () => {
      getVerifiedClaimsMock.mockResolvedValue(assistant);

      const res = await getOptions(req('http://localhost/api/tenant/entries/approval-options'));

      expect(res.status).toBe(403);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('maps an RPC-level admin rejection to 403', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'admin_only_entry_action' } });

      const res = await getOptions(req('http://localhost/api/tenant/entries/approval-options'));

      expect(res.status).toBe(403);
    });
  });

  describe('GET approval-price-preview', () => {
    it('passes group and price list ids to the preview RPC with the verified tenant', async () => {
      rpcMock.mockResolvedValue({ data: { headline: { name: 'Retail list' }, applicable: [] }, error: null });

      const res = await getPreview(req(`http://localhost/api/tenant/entries/approval-price-preview?cohort_id=${COHORT_ID}&price_list_id=${PRICE_LIST_ID}`));

      expect(res.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledWith('preview_approval_price_source', {
        p_tenant_id: 'tenant-a',
        p_actor_user_id: 'admin-1',
        p_cohort_id: COHORT_ID,
        p_price_list_id: PRICE_LIST_ID,
      });
    });

    it('treats absent params as "no group / no override"', async () => {
      await getPreview(req('http://localhost/api/tenant/entries/approval-price-preview'));

      expect(rpcMock).toHaveBeenCalledWith('preview_approval_price_source', expect.objectContaining({ p_cohort_id: null, p_price_list_id: null }));
    });

    it('rejects non-uuid ids', async () => {
      const res = await getPreview(req('http://localhost/api/tenant/entries/approval-price-preview?cohort_id=abc'));

      expect(res.status).toBe(400);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('forbids seller_assistant', async () => {
      getVerifiedClaimsMock.mockResolvedValue(assistant);

      const res = await getPreview(req('http://localhost/api/tenant/entries/approval-price-preview'));

      expect(res.status).toBe(403);
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  describe('inbox visibility for assistants', () => {
    it('count route passes the actor so the DB excludes approval entries for assistants', async () => {
      getVerifiedClaimsMock.mockResolvedValue(assistant);

      await getCount(req('http://localhost/api/tenant/entries/count'));

      expect(rpcMock).toHaveBeenCalledWith('list_entries', expect.objectContaining({ p_actor_user_id: 'asst-1' }));
    });

    it('buyer history route passes the actor so approval events are excluded for assistants', async () => {
      getVerifiedClaimsMock.mockResolvedValue(assistant);

      await getBuyerEvents(req('http://localhost/api/tenant/entries/buyer/b1/events'), { params: Promise.resolve({ buyerId: 'b1' }) });

      expect(rpcMock).toHaveBeenCalledWith('list_entry_events_for_buyer', expect.objectContaining({ p_actor_user_id: 'asst-1' }));
    });

    it('buyer documents of an approval entry are 404 for an assistant and 200 for an admin', async () => {
      entryMaybeSingle.mockResolvedValue({
        data: { id: ENTRY_ID, tenant_id: 'tenant-a', location_id: null, entry_type: 'business_approval', source_entity_type: 'buyer', source_entity_id: 'b1' },
        error: null,
      });

      getVerifiedClaimsMock.mockResolvedValue(assistant);
      const denied = await getDocuments(req(`http://localhost/api/tenant/entries/${ENTRY_ID}/documents`), { params: Promise.resolve({ id: ENTRY_ID }) });
      expect(denied.status).toBe(404);

      getVerifiedClaimsMock.mockResolvedValue(admin);
      const allowed = await getDocuments(req(`http://localhost/api/tenant/entries/${ENTRY_ID}/documents`), { params: Promise.resolve({ id: ENTRY_ID }) });
      expect(allowed.status).toBe(200);
    });
  });
});
