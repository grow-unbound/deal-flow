import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const rpcMock = vi.fn();

const state: {
  entry: Record<string, unknown> | null;
  entryFilters: Record<string, unknown>;
} = {
  entry: null,
  entryFilters: {},
};

class EntryQueryBuilder {
  filters: Record<string, unknown> = {};

  select() { return this; }
  eq(column: string, value: unknown) { this.filters[column] = value; return this; }
  is(column: string, value: unknown) { this.filters[`is:${column}`] = value; return this; }

  maybeSingle() {
    state.entryFilters = { ...this.filters };
    return Promise.resolve({ data: state.entry, error: null });
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
      from: () => new EntryQueryBuilder(),
    }),
  },
}));

import { GET } from '../../../app/api/tenant/entries/route';
import { POST } from '../../../app/api/tenant/entries/[id]/actions/route';

describe('tenant entries routes', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    rpcMock.mockReset();
    state.entry = null;
    state.entryFilters = {};
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'seller-1',
      tenant_id: 'tenant-a',
      role: 'seller_admin',
      location_ids: null,
    });
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it('lists entries with verified tenant, filters, cursor, and bounded page size', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: 'entry-2', priority_at: '2026-09-06T07:00:00.000Z' },
        { id: 'entry-1', priority_at: '2026-09-06T06:00:00.000Z' },
      ],
      error: null,
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/tenant/entries?q=ramesh&type=invoice_due,invoice_overdue&limit=1',
      { method: 'GET' },
    ) as any);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('list_entries', {
      p_tenant_id: 'tenant-a',
      p_location_ids: null,
      p_status_scope: 'active',
      p_entry_types: ['invoice_due', 'invoice_overdue'],
      p_search: 'ramesh',
      p_limit: 2,
      p_cursor_priority_at: null,
      p_cursor_id: null,
    });
    expect(body.entries).toEqual([{ id: 'entry-2', priority_at: '2026-09-06T07:00:00.000Z' }]);
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it('passes assistant location scope to the list rpc', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'seller-2',
      tenant_id: 'tenant-a',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });

    await GET(new NextRequest('http://localhost/api/tenant/entries', { method: 'GET' }) as any);

    expect(rpcMock).toHaveBeenCalledWith('list_entries', expect.objectContaining({
      p_location_ids: ['loc-1'],
    }));
  });

  it('blocks buyer users from listing entries', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'buyer-1',
      tenant_id: 'tenant-a',
      role: 'buyer_admin',
      location_ids: null,
    });

    const response = await GET(new NextRequest('http://localhost/api/tenant/entries', { method: 'GET' }) as any);

    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('applies generic actions only after tenant and location authorization', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'seller-2',
      tenant_id: 'tenant-a',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    state.entry = { id: 'entry-1', tenant_id: 'tenant-a', location_id: 'loc-1' };
    rpcMock.mockResolvedValue({ data: { id: 'entry-1', status: 'waiting' }, error: null });

    const response = await POST(
      new NextRequest('http://localhost/api/tenant/entries/entry-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'remind_later', remind_at: '2026-09-07T09:00:00.000+05:30' }),
      }) as any,
      { params: Promise.resolve({ id: 'entry-1' }) },
    );

    expect(response.status).toBe(200);
    expect(state.entryFilters).toMatchObject({ id: 'entry-1', 'is:deleted_at': null });
    expect(rpcMock).toHaveBeenCalledWith('apply_entry_action', {
      p_tenant_id: 'tenant-a',
      p_entry_id: 'entry-1',
      p_actor_user_id: 'seller-2',
      p_action: 'remind_later',
      p_note: null,
      p_remind_at: '2026-09-07T09:00:00.000+05:30',
      p_metadata: {},
    });
  });

  it('blocks generic actions outside an assistant location scope', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'seller-2',
      tenant_id: 'tenant-a',
      role: 'seller_assistant',
      location_ids: ['loc-1'],
    });
    state.entry = { id: 'entry-1', tenant_id: 'tenant-a', location_id: 'loc-2' };

    const response = await POST(
      new NextRequest('http://localhost/api/tenant/entries/entry-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'open' }),
      }) as any,
      { params: Promise.resolve({ id: 'entry-1' }) },
    );

    expect(response.status).toBe(403);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
