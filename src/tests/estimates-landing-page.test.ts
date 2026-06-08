import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();

interface EstimateRow {
  id: string;
  estimate_number: string | null;
  buyer_id: string;
  status: string;
  total_amount: number;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  source: string | null;
  catalog_id?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
}

interface QueryState {
  buyers: Array<{ id: string; business_name: string; geography?: { city?: string; state?: string } | null }>;
  estimates: EstimateRow[];
  estimateItems: Array<{ estimate_id: string }>;
  catalogs: Array<{ id: string; name: string }>;
}

const queryState: QueryState = {
  buyers: [],
  estimates: [],
  estimateItems: [],
  catalogs: [],
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private table: string;
    private conditions: Array<{ kind: 'eq' | 'is' | 'gte' | 'lt' | 'in'; column: string; value: unknown }> = [];
    private orderBy: { column: string; ascending: boolean } | null = null;
    private take: number | null = null;

    constructor(table: string) {
      this.table = table;
    }

    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.conditions.push({ kind: 'eq', column, value });
      return this;
    }
    is(column: string, value: unknown) {
      this.conditions.push({ kind: 'is', column, value });
      return this;
    }
    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending ?? true };
      return this;
    }
    limit(value: number) {
      this.take = value;
      return this;
    }
    in(column: string, value: unknown) {
      this.conditions.push({ kind: 'in', column, value });
      return this;
    }
    gte(column: string, value: unknown) {
      this.conditions.push({ kind: 'gte', column, value });
      return this;
    }
    lt(column: string, value: unknown) {
      this.conditions.push({ kind: 'lt', column, value });
      return this;
    }

    then(resolve: (value: { data: unknown; error: null }) => void) {
      const applyFilters = (rows: any[]) => {
        let result = [...rows];
        for (const condition of this.conditions) {
          if (condition.kind === 'eq' || condition.kind === 'is') {
            continue;
          }
          if (condition.kind === 'in') {
            const values = Array.isArray(condition.value) ? condition.value : [];
            result = result.filter((row) => values.includes(row[condition.column]));
            continue;
          }
          if (condition.kind === 'gte' || condition.kind === 'lt') {
            const threshold = new Date(String(condition.value)).getTime();
            result = result.filter((row) => {
              const rowValue = row[condition.column];
              if (typeof rowValue !== 'string') return false;
              const time = new Date(rowValue).getTime();
              return condition.kind === 'gte' ? time >= threshold : time < threshold;
            });
          }
        }
        if (this.orderBy) {
          result.sort((a, b) => {
            const av = a[this.orderBy!.column];
            const bv = b[this.orderBy!.column];
            if (typeof av === 'string' && typeof bv === 'string') {
              const delta = new Date(av).getTime() - new Date(bv).getTime();
              return this.orderBy!.ascending ? delta : -delta;
            }
            const delta = Number(av ?? 0) - Number(bv ?? 0);
            return this.orderBy!.ascending ? delta : -delta;
          });
        }
        if (this.take != null) {
          result = result.slice(0, this.take);
        }
        return result;
      };

      if (this.table === 'buyers') return resolve({ data: applyFilters(queryState.buyers), error: null });
      if (this.table === 'estimates') return resolve({ data: applyFilters(queryState.estimates), error: null });
      if (this.table === 'estimate_items') return resolve({ data: applyFilters(queryState.estimateItems), error: null });
      if (this.table === 'published_catalogs') return resolve({ data: applyFilters(queryState.catalogs), error: null });
      return resolve({ data: [], error: null });
    }
  }

  const from = vi.fn((table: string) => new QueryMock(table));

  return {
    supabaseAdmin: {
      auth: {
        admin: {
          getUserById: vi.fn(async (userId: string) => ({
            data: {
              user: {
                id: userId,
                email: `${userId}@dealflow.in`,
                user_metadata: { full_name: userId === 'u-seller' ? 'Priya Shah' : 'Team Member' },
              },
            },
            error: null,
          })),
        },
      },
      schema: vi.fn(() => ({ from })),
    },
  };
});

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/tenant/estimates/route';

describe('estimates landing API route', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    queryState.buyers = [{ id: 'b1', business_name: 'Acme Retail', geography: { city: 'Mumbai', state: 'MH' } }];
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const sentOld = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    queryState.estimates = [
      {
        id: 'e1',
        estimate_number: 'EST-2026-0001',
        buyer_id: 'b1',
        status: 'accepted',
        total_amount: 50000,
        created_at: '2026-06-01T10:00:00.000Z',
        sent_at: '2026-06-01T11:00:00.000Z',
        accepted_at: '2026-06-02T10:00:00.000Z',
        expires_at: soon,
        source: 'buyer_app',
        catalog_id: 'c1',
        updated_at: '2026-06-02T10:00:00.000Z',
      },
      {
        id: 'e2',
        estimate_number: 'EST-2026-0002',
        buyer_id: 'b1',
        status: 'sent',
        total_amount: 12000,
        created_at: '2026-06-03T10:00:00.000Z',
        sent_at: sentOld,
        accepted_at: null,
        expires_at: null,
        source: 'buyer_app',
        catalog_id: 'c1',
        updated_at: '2026-06-03T10:00:00.000Z',
      },
      {
        id: 'e3',
        estimate_number: 'EST-2026-0003',
        buyer_id: 'b1',
        status: 'draft',
        total_amount: 8000,
        created_at: '2026-06-04T10:00:00.000Z',
        sent_at: null,
        accepted_at: null,
        expires_at: soon,
        source: 'seller',
        catalog_id: null,
        created_by: 'u-seller',
        updated_at: '2026-06-04T10:00:00.000Z',
      },
      {
        id: 'e4',
        estimate_number: 'EST-2026-0004',
        buyer_id: 'b1',
        status: 'converted',
        total_amount: 2000,
        created_at: '2026-05-01T10:00:00.000Z',
        sent_at: '2026-05-02T10:00:00.000Z',
        accepted_at: '2026-06-05T12:00:00.000Z',
        expires_at: null,
        source: 'seller',
        catalog_id: 'c2',
        created_by: 'u-seller',
        updated_at: '2026-06-05T14:00:00.000Z',
      },
    ];
    queryState.estimateItems = [
      { estimate_id: 'e1' },
      { estimate_id: 'e1' },
      { estimate_id: 'e2' },
    ];
    queryState.catalogs = [
      { id: 'c1', name: 'Summer 2026 Retail' },
      { id: 'c2', name: 'Clearance Push' },
    ];
  });

  it('counts ready to convert as accepted and expiring-soon for open estimates within 7 days', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin' });

    const res = await GET(new NextRequest('http://localhost/api/tenant/estimates?period=month'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.kpis.total_estimates_this_period).toBe(3);
    expect(body.kpis.total_estimates_prev_period).toBe(1);
    expect(body.kpis.total_estimates_growth_pct).toBe(200);
    expect(body.kpis.total_gmv_this_period).toBe(70000);
    expect(body.kpis.total_gmv_prev_period).toBe(2000);
    expect(body.kpis.aov).toBe(70000 / 3);
    expect(body.kpis.open_estimates_this_period).toBe(3);
    expect(body.kpis.converted_this_period).toBe(1);
    expect(body.kpis.ready_to_convert).toBe(1);
    expect(body.kpis.expiring_soon).toBe(2);
    expect(body.kpis.open_total).toBe(3);

    const buyerAppRow = body.estimates.find((r: { id: string }) => r.id === 'e1');
    expect(buyerAppRow.source_label).toBe('Buyer App');
    expect(buyerAppRow.catalog_name).toBe('Summer 2026 Retail');
    expect(buyerAppRow.buyer_city).toBe('Mumbai');
    expect(buyerAppRow.buyer_state).toBe('MH');
    const sellerRow = body.estimates.find((r: { id: string }) => r.id === 'e3');
    expect(sellerRow.source_label).toBe('created by Priya Shah');
    expect(sellerRow.source_detail).toBe('Manual seller entry');

    expect(body.todays_read.needs_follow_up.length).toBeGreaterThanOrEqual(1);
    expect(body.todays_read.needs_follow_up[0].estimate_number).toBe('EST-2026-0002');
  });

  it('returns 403 for non-seller roles', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'buyer_admin' });
    const res = await GET(new NextRequest('http://localhost/api/tenant/estimates'));
    expect(res.status).toBe(403);
  });
});
