import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();

const state = {
  estimateCount: 4,
  insertedEstimateId: 'est-1',
  updatedRows: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: vi.fn().mockResolvedValue({ create_enquiries: true }),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: vi.fn(() => true),
  loadAccessibleSellerLocations: vi.fn(async () => [{ id: 'loc-1', name: 'North Hub' }]),
  resolveDefaultSellerLocationId: vi.fn(() => 'loc-1'),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private countHead = false;

    constructor(private readonly table: string) {}

    select(_value?: string, opts?: { count?: string; head?: boolean }) {
      this.countHead = Boolean(this.table === 'estimates' && opts?.head);
      return this;
    }
    eq() {
      return this;
    }
    is() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    maybeSingle() {
      if (this.table === 'estimates') {
        return Promise.resolve({ data: { id: state.insertedEstimateId, tenant_id: 'tenant-1' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
    single() {
      return Promise.resolve({ data: { id: state.insertedEstimateId }, error: null });
    }
    insert(payload: Record<string, unknown>) {
      state.updatedRows.push(payload);
      return this;
    }
    update(payload: Record<string, unknown>) {
      state.updatedRows.push(payload);
      return this;
    }
    then(resolve: (value: { data: unknown; error: null }) => void) {
      if (this.countHead) {
        resolve({ data: [], error: null, count: state.estimateCount } as unknown as { data: unknown; error: null });
        return;
      }
      resolve({ data: [], error: null });
    }
  }

  return {
    supabaseAdmin: {
      schema: () => ({
        from: (table: string) => new QueryMock(table),
      }),
    },
  };
});

describe('estimate composer API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updatedRows = [];
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', sub: 'user-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'est-1', estimate_number: 'EST-2026-00005' } }),
    }) as unknown as typeof fetch;
  });

  it('creates a seller draft without trusting client tenant input', async () => {
    const { POST } = await import('../../app/api/tenant/estimates/route');
    const request = new NextRequest('http://localhost/api/tenant/estimates', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.id).toBe('est-1');
    expect(state.updatedRows[0]).toMatchObject({
      tenant_id: 'tenant-1',
      buyer_id: null,
      status: 'draft',
      source: 'seller',
    });
  });

  it('marks an estimate sent through the dedicated send endpoint', async () => {
    const { PATCH } = await import('../../app/api/tenant/estimates/[id]/send/route');
    const request = new NextRequest('http://localhost/api/tenant/estimates/est-1/send', {
      method: 'PATCH',
      body: JSON.stringify({
        channel: 'whatsapp',
        recipient: '9999999999',
        message: 'Please review this estimate.',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'est-1' }) });
    expect(response.status).toBe(200);
    expect(state.updatedRows[0]).toMatchObject({
      status: 'sent',
      sent_channel: 'whatsapp',
      updated_by: 'user-1',
    });
  });
});
