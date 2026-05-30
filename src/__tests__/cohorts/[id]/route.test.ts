import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();

const state = {
  exists: true,
  tenantId: 'tenant-a',
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'id') {
        (chain as any)._id = value;
      }
      if (column === 'tenant_id') {
        (chain as any)._tenant = value;
      }
      return chain;
    }),
    neq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      if (!state.exists) return { data: null, error: null };
      return { data: { id: (chain as any)._id ?? 'c1', tenant_id: state.tenantId }, error: null };
    }),
    single: vi.fn(async () => ({
      data: {
        id: 'c1',
        tenant_id: 'tenant-a',
        name: 'Cohort',
        description: 'Desc',
        rules: { filters: [] },
        is_static: false,
        cached_member_count: 1,
        created_at: new Date().toISOString(),
        created_by: null,
        updated_at: new Date().toISOString(),
      },
      error: null,
    })),
    contains: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
  } as any;

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({
        from: vi.fn(() => chain),
      })),
    },
  };
});

import { GET } from '../../../../app/api/cohorts/[id]/route';

describe('cohort detail route security and conversion', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getFlagMock.mockReset();
    state.exists = true;
    state.tenantId = 'tenant-a';
    getFlagMock.mockResolvedValue(true);
  });

  it('returns 403 when cohort belongs to another tenant', async () => {
    state.exists = true;
    state.tenantId = 'tenant-b';
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/cohorts/c1') as any, {
      params: Promise.resolve({ id: 'c1' }),
    });

    expect(res.status).toBe(403);
  });

  it('conversion formula equals (catalog orders/catalog opens) * 100 in response', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new Request('http://localhost/api/cohorts/c1') as any, {
      params: Promise.resolve({ id: 'c1' }),
    });

    const body = await res.json();
    const opens = Number(
      (body.performance.catalogs ?? []).reduce((sum: number, catalog: { opens?: number }) => sum + Number(catalog.opens ?? 0), 0),
    );
    const orders = Number(
      (body.performance.catalogs ?? []).reduce((sum: number, catalog: { orders?: number }) => sum + Number(catalog.orders ?? 0), 0),
    );
    const expected = opens > 0 ? Number(((orders / opens) * 100).toFixed(1)) : 0;
    expect(body.performance.engagement.conversion_pct).toBe(expected);
  });

  it('returns opens as zero safely when PostHog config is missing', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const prevKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const prevProject = process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;

    try {
      const res = await GET(new Request('http://localhost/api/cohorts/c1') as any, {
        params: Promise.resolve({ id: 'c1' }),
      });
      const body = await res.json();
      const opens = (body.performance.catalogs ?? []).map((catalog: { opens?: number }) => Number(catalog.opens ?? 0));
      expect(opens.every((value: number) => value === 0)).toBe(true);
    } finally {
      if (prevKey !== undefined) process.env.POSTHOG_PERSONAL_API_KEY = prevKey;
      if (prevProject !== undefined) process.env.POSTHOG_PROJECT_ID = prevProject;
    }
  });
});
