import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const getCohortsLandingPayloadMock = vi.fn();

class QueryBuilder {
  select() {
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

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    return Promise.resolve(
      resolve({
        data: [
          { id: 'cohort-1', name: 'Retailers', description: 'Core accounts', allowed_tenant_brand_ids: ['brand-1'] },
        ],
        error: null,
      }),
    );
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: vi.fn(() => new QueryBuilder()),
    })),
  },
}));

vi.mock('../../app/api/cohorts/route', async () => {
  const actual = await vi.importActual<typeof import('../../app/api/cohorts/route')>('../../app/api/cohorts/route');
  return {
    ...actual,
    getCohortsLandingPayload: (...args: unknown[]) => getCohortsLandingPayloadMock(...args),
  };
});

import { GET as getTenantCohorts } from '../../app/api/tenant/cohorts/route';
import { GET as getCohorts } from '../../app/api/cohorts/route';

describe('cohorts grow access', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getFlagMock.mockReset();
    getCohortsLandingPayloadMock.mockReset();

    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    getCohortsLandingPayloadMock.mockResolvedValue({ cohorts: [], kpis: {} });
  });

  it('blocks seller assistants from the tenant cohorts landing surface', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_assistant' });

    const response = await getTenantCohorts(new NextRequest('http://localhost/api/tenant/cohorts'));

    expect(response.status).toBe(403);
  });

  it('blocks seller assistants from the generic cohorts landing route', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_assistant' });

    const response = await getCohorts(new NextRequest('http://localhost/api/cohorts'));

    expect(response.status).toBe(403);
  });

  it('still serves the generic cohorts list to seller admins', async () => {
    const response = await getCohorts(new NextRequest('http://localhost/api/cohorts'));
    const body = (await response.json()) as { cohorts: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.cohorts).toHaveLength(1);
  });
});
