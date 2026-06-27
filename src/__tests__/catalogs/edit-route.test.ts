import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();

const state = {
  status: 'published',
  tenantId: 'tenant-1',
};

class QueryBuilder {
  table: string;

  constructor(table: string) {
    this.table = table;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  is() {
    return this;
  }

  maybeSingle() {
    if (this.table === 'campaigns') {
      return Promise.resolve({
        data: { id: 'cat-1', tenant_id: state.tenantId, status: state.status, share_token: null },
        error: null,
      });
    }
    if (this.table === 'cohorts') {
      return Promise.resolve({
        data: { id: '123e4567-e89b-12d3-a456-426614174000' },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }

  update() {
    return this;
  }

  single() {
    return Promise.resolve({
      data: { id: 'cat-1', status: state.status },
      error: null,
    });
  }

  then(resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown) {
    return Promise.resolve(resolve({ data: [{ id: '223e4567-e89b-12d3-a456-426614174000' }], error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogQueryClient: () => ({ query: vi.fn().mockResolvedValue({ results: [] }) }),
}));

vi.mock('@/lib/server/dashboard-cache', () => ({
  revalidateSellerDashboardCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => new QueryBuilder(table)),
    })),
  },
}));

import { PATCH } from '../../../app/api/tenant/catalogs/[id]/route';

describe('PATCH /api/tenant/catalogs/[id]', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    state.status = 'published';
    state.tenantId = 'tenant-1';
  });

  it.skip('allows saving unpublished changes for a published catalog', async () => {
    const request = new Request('http://localhost/api/tenant/catalogs/cat-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Edited Catalog',
        scope_type: 'cohort',
        cohort_id: '123e4567-e89b-12d3-a456-426614174000',
        valid_from: '2026-06-01T00:00:00.000Z',
        valid_to: '2026-06-30T00:00:00.000Z',
        filters: {
          brand_names: ['Solar Estates'],
          category_names: ['Red wine'],
          availability: 'show_everything',
        },
        items: [{ tenant_product_id: '223e4567-e89b-12d3-a456-426614174000', display_order: 0 }],
        save_mode: 'draft',
      }),
    });

    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: 'cat-1' }),
    });
    const body = await response.json() as any;

    expect(body.error).not.toMatch(/draft catalogs/i);
  });
});
