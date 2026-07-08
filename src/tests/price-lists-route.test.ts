import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getAuthUserEmailMapMock = vi.fn();
const getFlagMock = vi.fn();

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

  order() {
    return this;
  }

  limit() {
    return this;
  }

  in() {
    return this;
  }

  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    if (this.table === 'price_lists') {
      return Promise.resolve(
        resolve({
          data: [
            {
              id: 'pl-1',
              tenant_id: 'tenant-1',
              name: 'Core retailers',
              description: 'Primary cohort',
              currency: 'INR',
              valid_from: '2026-07-01T00:00:00.000Z',
              valid_to: '2026-07-20T00:00:00.000Z',
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
              is_active: true,
              pricing_strategy: 'edit_each',
              strategy_value: null,
              filters: null,
              created_at: '2026-07-03T00:00:00.000Z',
              updated_at: '2026-07-04T00:00:00.000Z',
              created_by: 'user-2',
            },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'tenant_products') {
      return Promise.resolve(
        resolve({
          data: [
            { id: 'tp-1', base_selling_price: 100, cost_price: 70 },
            { id: 'tp-2', base_selling_price: 200, cost_price: 120 },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'cohorts') {
      return Promise.resolve(
        resolve({
          data: [
            { id: 'cohort-1', name: 'Retailers' },
            { id: 'cohort-2', name: 'Dormant buyers' },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'cohort_members') {
      return Promise.resolve(
        resolve({
          data: [
            { cohort_id: 'cohort-1', buyer_id: 'buyer-1' },
            { cohort_id: 'cohort-2', buyer_id: 'buyer-2' },
            { cohort_id: 'cohort-2', buyer_id: 'buyer-3' },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'price_list_items') {
      return Promise.resolve(
        resolve({
          data: [
            { id: 'item-1', price_list_id: 'pl-1', tenant_product_id: 'tp-1', price: 90 },
            { id: 'item-2', price_list_id: 'pl-2', tenant_product_id: 'tp-2', price: 180 },
          ],
          error: null,
        }),
      );
    }

    if (this.table === 'price_list_assignments') {
      return Promise.resolve(
        resolve({
          data: [
            { id: 'assign-1', price_list_id: 'pl-1', target_type: 'cohort', target_id: 'cohort-1' },
            { id: 'assign-2', price_list_id: 'pl-2', target_type: 'cohort', target_id: 'cohort-2' },
          ],
          error: null,
        }),
      );
    }

    return Promise.resolve(resolve({ data: [], error: null }));
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
      from: vi.fn((table: string) => new QueryBuilder(table)),
    })),
  },
}));

import { GET } from '../../app/api/price-lists/route';

describe('GET /api/price-lists', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    getAuthUserEmailMapMock.mockReset();
    getFlagMock.mockReset();

    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    getAuthUserEmailMapMock.mockResolvedValue(new Map([
      ['user-1', 'owner-one@example.com'],
      ['user-2', 'owner-two@example.com'],
    ]));
  });

  it('rejects seller assistants from price lists', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-1', role: 'seller_assistant' });

    const response = await GET(new NextRequest('http://localhost/api/price-lists'));

    expect(response.status).toBe(403);
  });

  it('keeps KPIs invariant when the table row limit changes', async () => {
    const response = await GET(new NextRequest('http://localhost/api/price-lists?limit=1'));
    const body = (await response.json()) as {
      kpis: { active_lists: number; cohorts_covered: number; products_with_overrides: number };
      price_lists: Array<{ id: string }>;
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body.kpis.active_lists).toBe(2);
    expect(body.kpis.cohorts_covered).toBe(2);
    expect(body.kpis.products_with_overrides).toBe(2);
    expect(body.price_lists).toHaveLength(1);
    expect(body.total).toBe(2);
  });
});
