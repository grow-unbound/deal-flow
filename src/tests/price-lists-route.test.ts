import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getAuthUserEmailMapMock = vi.fn();
const getFlagMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const searchSellerLandingEntityIdsMock = vi.fn();

const PRICE_LISTS = [
  {
    id: 'pl-1',
    tenant_id: 'tenant-1',
    name: 'Core retailers',
    description: 'Primary cohort',
    currency: 'INR',
    valid_from: '2026-07-01T00:00:00.000Z',
    valid_to: '2099-07-20T00:00:00.000Z',
    priority: 1,
    is_active: true,
    pricing_strategy: 'edit_each',
    strategy_value: null,
    filters: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    created_by: 'user-1',
  },
  {
    id: 'pl-2',
    tenant_id: 'tenant-1',
    name: 'Dormant win-back',
    description: null,
    currency: 'INR',
    valid_from: '2026-07-03T00:00:00.000Z',
    valid_to: null,
    priority: 2,
    is_active: false,
    pricing_strategy: 'flat_off_base',
    strategy_value: 5,
    filters: null,
    created_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-04T00:00:00.000Z',
    created_by: 'user-2',
  },
];

const AGGREGATE_PAYLOAD = {
  row_metrics: [
    {
      id: 'pl-1',
      product_count: 7,
      avg_discount_pct: '10.5',
      avg_margin_pct: '22.5',
      cohorts_count: 2,
      cohort_names: ['Retailers', 'Preferred'],
    },
    {
      id: 'pl-2',
      product_count: 3,
      avg_discount_pct: null,
      avg_margin_pct: null,
      cohorts_count: 1,
      cohort_names: ['Dormant buyers'],
    },
  ],
  summary: {
    kpis: {
      active_lists: 2,
      draft_lists: 1,
      expiring_soon: 1,
      cohorts_covered: 2,
      cohorts_total: 4,
      products_with_overrides: 9,
    },
    counts: { active: 2, draft: 1, expired: 1 },
    todays_read: {
      expiring_soon: [{
        id: 'pl-3',
        name: 'Seasonal',
        valid_until: '2026-07-20T00:00:00.000Z',
        cohorts_count: 3,
        status: 'active',
      }],
      most_coverage: [{
        id: 'pl-4',
        name: 'All products',
        product_count: 120,
        valid_until: null,
      }],
      uncovered_cohorts: [{ id: 'cohort-3', name: 'New buyers', member_count: 8 }],
    },
  },
};

class QueryBuilder {
  private ids: string[] | null = null;
  private rowLimit: number | null = null;

  select() {
    return this;
  }

  eq() {
    return this;
  }

  is() {
    return this;
  }

  in(column: string, values: string[]) {
    if (column === 'id') this.ids = values;
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    const idSet = new Set(this.ids ?? []);
    const rows = PRICE_LISTS
      .filter((row) => idSet.has(row.id))
      .slice(0, this.rowLimit ?? PRICE_LISTS.length);
    return Promise.resolve(resolve({ data: rows, error: null }));
  }
}

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/auth-user-directory', () => ({
  getAuthUserEmailMap: (...args: unknown[]) => getAuthUserEmailMapMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: (...args: unknown[]) => fromMock(...args),
      rpc: (...args: unknown[]) => rpcMock(...args),
    })),
  },
}));

vi.mock('@/lib/server/seller-landing-entity-search', () => ({
  searchSellerLandingEntityIds: (...args: unknown[]) => searchSellerLandingEntityIdsMock(...args),
}));

import { GET } from '../../app/api/price-lists/route';

describe('GET /api/price-lists', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getAuthUserEmailMapMock.mockReset();
    getFlagMock.mockReset();
    rpcMock.mockReset();
    fromMock.mockReset();
    searchSellerLandingEntityIdsMock.mockReset();

    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    getAuthUserEmailMapMock.mockImplementation(async (ids: string[]) => new Map(
      ids.map((id) => [id, `${id}@example.com`]),
    ));
    fromMock.mockImplementation((table: string) => {
      if (table !== 'price_lists') throw new Error(`Unexpected tenant-wide GET query: ${table}`);
      return new QueryBuilder();
    });
    searchSellerLandingEntityIdsMock.mockImplementation(async ({ limit, offset }: { limit: number; offset: number }) => ({
      ids: PRICE_LISTS.slice(offset, offset + limit).map((row) => row.id),
      total: PRICE_LISTS.length,
    }));
    rpcMock.mockImplementation(async (name: string, params: { p_include_summary: boolean; p_page_ids: string[] }) => {
      expect(name).toBe('get_seller_price_list_landing_aggregates');
      return {
        data: {
          row_metrics: AGGREGATE_PAYLOAD.row_metrics.filter((row) => params.p_page_ids.includes(row.id)),
          summary: params.p_include_summary ? AGGREGATE_PAYLOAD.summary : null,
        },
        error: null,
      };
    });
  });

  it('rejects seller assistants from price lists', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_assistant' });

    const response = await GET(new NextRequest('http://localhost/api/price-lists'));

    expect(response.status).toBe(403);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('hydrates only the selected page and keeps tenant summary values from the aggregate RPC', async () => {
    const response = await GET(new NextRequest('http://localhost/api/price-lists?limit=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kpis).toEqual({
      active_lists: 2,
      draft_lists: 1,
      expiring_soon: 1,
      cohorts_covered: 2,
      cohorts_total: 4,
      products_with_overrides: 9,
    });
    expect(body.counts).toEqual({ active: 2, draft: 1, expired: 1 });
    expect(body.price_lists).toEqual([
      expect.objectContaining({
        id: 'pl-1',
        product_count: 7,
        avg_discount_pct: 10.5,
        avg_margin_pct: 22.5,
        cohorts_count: 2,
        cohort_names: ['Retailers', 'Preferred'],
        created_by_label: 'user-1@example.com',
      }),
    ]);
    expect(body.todays_read.most_coverage[0]).toEqual(expect.objectContaining({
      id: 'pl-4',
      product_count: 120,
      initials: 'AP',
      valid_until_label: 'No end date',
    }));
    expect(body.total).toBe(2);
    expect(body.nextOffset).toBe(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('price_lists');
    expect(getAuthUserEmailMapMock).toHaveBeenCalledWith(['user-1']);
    expect(rpcMock).toHaveBeenCalledWith(
      'get_seller_price_list_landing_aggregates',
      expect.objectContaining({
        p_tenant_id: 'tenant-1',
        p_page_ids: ['pl-1'],
        p_include_summary: true,
      }),
    );
  });

  it('pushes search/status pagination into ID search and skips tenant summary on later pages', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/price-lists?search=dormant&status=Active&status=Expired&limit=1&offset=1&include_summary=false',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(searchSellerLandingEntityIdsMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      entity: 'price_lists',
      query: 'dormant',
      statuses: ['active', 'expired'],
      limit: 1,
      offset: 1,
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'get_seller_price_list_landing_aggregates',
      expect.objectContaining({ p_page_ids: ['pl-2'], p_include_summary: false }),
    );
    expect(getAuthUserEmailMapMock).toHaveBeenCalledWith(['user-2']);
    expect(body.price_lists).toEqual([
      expect.objectContaining({
        id: 'pl-2',
        status: 'draft',
        product_count: 3,
        created_by_label: 'user-2@example.com',
      }),
    ]);
    expect(body).not.toHaveProperty('kpis');
    expect(body).not.toHaveProperty('todays_read');
    expect(body).not.toHaveProperty('counts');
    expect(body).not.toHaveProperty('cohorts_total');
    expect(body.nextOffset).toBeNull();
  });
});
