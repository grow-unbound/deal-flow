import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const estimateKpiCallState = { count: 0 };

interface EstimateRow {
  id: string;
  location_id?: string | null;
  estimate_number: string | null;
  buyer_id: string;
  status: string;
  total_amount: number;
  estimate_date?: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  source: string | null;
  is_buyer_app_estimate?: boolean;
  campaign_id?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
}

interface QueryState {
  buyers: Array<{ id: string; business_name: string; geography?: { city?: string; state?: string } | null }>;
  estimates: EstimateRow[];
  estimateItems: Array<{ estimate_id: string }>;
  catalogs: Array<{ id: string; name: string }>;
  currentKpis: Array<Record<string, unknown>>;
  previousKpis: Array<Record<string, unknown>>;
  aggregateKpis: Array<Record<string, unknown>>;
  snapshot: {
    total_count: number;
    draft_count: number;
    sent_count: number;
    accepted_count: number;
    expiring_soon: number;
  } | null;
}

const queryState: QueryState = {
  buyers: [],
  estimates: [],
  estimateItems: [],
  catalogs: [],
  currentKpis: [],
  previousKpis: [],
  aggregateKpis: [],
  snapshot: null,
};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  applySellerLocationScope: <T extends { in?: (column: string, values: string[]) => T }>(
    query: T,
    claims: { location_ids?: string[] | null; role?: string | null },
  ) => {
    if (claims.role === 'seller_assistant' && claims.location_ids?.length && query.in) {
      return query.in('location_id', claims.location_ids);
    }
    return query;
  },
  loadAccessibleSellerLocations: vi.fn(async (_db: unknown, _tenantId: string, claims: { location_ids?: string[] | null }) => {
    const all = [
      { id: 'loc-1', name: 'North Hub' },
      { id: 'loc-2', name: 'South Hub' },
    ];
    return claims.location_ids?.length ? all.filter((row) => claims.location_ids?.includes(row.id)) : all;
  }),
  resolveDefaultSellerLocationId: vi.fn(() => 'loc-1'),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getInAppCreateFlags: vi.fn().mockResolvedValue({ create_estimates: true, create_invoices: true }),
}));

vi.mock('@/lib/supabase', () => {
  class QueryMock {
    private table: string;
    private conditions: Array<{ kind: 'eq' | 'is' | 'gte' | 'lt' | 'lte' | 'in' | 'not_is_null'; column: string; value: unknown }> = [];
    private orderBy: { column: string; ascending: boolean } | null = null;
    private take: number | null = null;
    private head = false;
    private periodFilter:
      | { primary: string; fallback: string; start: number; endExclusive: number }
      | null = null;

    constructor(table: string) {
      this.table = table;
    }

    select(_columns?: string, options?: { head?: boolean }) {
      this.head = Boolean(options?.head);
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
    lte(column: string, value: unknown) {
      this.conditions.push({ kind: 'lte', column, value });
      return this;
    }
    not(column: string, operator: string, value: unknown) {
      if (operator === 'is' && value === null) {
        this.conditions.push({ kind: 'not_is_null', column, value: null });
      }
      return this;
    }
    or(filter: string) {
      const match = filter.match(
        /and\(estimate_date\.gte\.([^,]+),estimate_date\.lt\.([^)]+)\),and\(estimate_date\.is\.null,created_at\.gte\.([^,]+),created_at\.lt\.([^)]+)\)/,
      );
      if (match) {
        this.periodFilter = {
          primary: 'estimate_date',
          fallback: 'created_at',
          start: new Date(match[1]).getTime(),
          endExclusive: new Date(match[2]).getTime(),
        };
      }
      return this;
    }

    then(resolve: (value: { data: unknown; error: null; count?: number }) => void) {
      const applyFilters = (rows: any[]) => {
        let result = [...rows];
        if (this.periodFilter) {
          result = result.filter((row) => {
            const primaryValue = row[this.periodFilter!.primary];
            const fallbackValue = row[this.periodFilter!.fallback];
            const rawValue = typeof primaryValue === 'string' ? primaryValue : fallbackValue;
            if (typeof rawValue !== 'string') return false;
            const time = new Date(rawValue).getTime();
            return time >= this.periodFilter!.start && time < this.periodFilter!.endExclusive;
          });
        }
        for (const condition of this.conditions) {
          if (condition.kind === 'eq' || condition.kind === 'is') {
            result = result.filter((row) => !(condition.column in row) || row[condition.column] === condition.value);
            continue;
          }
          if (condition.kind === 'in') {
            const values = Array.isArray(condition.value) ? condition.value : [];
            result = result.filter((row) => values.includes(row[condition.column]));
            continue;
          }
          if (condition.kind === 'not_is_null') {
            result = result.filter((row) => row[condition.column] != null);
            continue;
          }
          if (condition.kind === 'gte' || condition.kind === 'lt' || condition.kind === 'lte') {
            const threshold = new Date(String(condition.value)).getTime();
            result = result.filter((row) => {
              const rowValue = row[condition.column];
              if (typeof rowValue !== 'string') return false;
              const time = new Date(rowValue).getTime();
              if (condition.kind === 'gte') return time >= threshold;
              if (condition.kind === 'lt') return time < threshold;
              return time <= threshold;
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

      const finish = (rows: unknown[]) => {
        const filtered = applyFilters(rows);
        return resolve({
          data: this.head ? null : filtered,
          error: null,
          count: this.head ? filtered.length : undefined,
        });
      };

      if (this.table === 'buyers') return finish(queryState.buyers);
      if (this.table === 'estimates') return finish(queryState.estimates);
      if (this.table === 'estimate_items') return finish(queryState.estimateItems);
      if (this.table === 'campaigns') return finish(queryState.catalogs);
      if (this.table === 'kpi_estimates_current') return finish(queryState.currentKpis);
      if (this.table === 'kpi_estimates_previous') return finish(queryState.previousKpis);
      if (this.table === 'kpi_estimates_aggregate') return finish(queryState.aggregateKpis);
      return finish([]);
    }
  }

  const from = vi.fn((table: string) => {
    if (table === 'kpi_estimates_daily') {
      estimateKpiCallState.count += 1;
      if (estimateKpiCallState.count === 1) return new QueryMock('kpi_estimates_current');
      if (estimateKpiCallState.count === 2) return new QueryMock('kpi_estimates_previous');
      return new QueryMock('kpi_estimates_aggregate');
    }
    return new QueryMock(table);
  });
  const sum = (rows: Array<Record<string, unknown>>, key: string) =>
    rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const scopedRows = (rows: Array<Record<string, unknown>>, args?: { p_location_ids?: string[] | null }) => {
    const locationIds = args?.p_location_ids ?? null;
    return locationIds?.length
      ? rows.filter((row) => row.scope === 'location' && locationIds.includes(String(row.location_id)))
      : rows.filter((row) => row.scope === 'tenant');
  };
  const rpc = vi.fn(async (name: string, args?: { p_location_ids?: string[] | null }) => {
    if (name !== 'metrics_v2_transaction_landing') return { data: null, error: null };
    const current = scopedRows(queryState.currentKpis, args);
    const previous = scopedRows(queryState.previousKpis, args);
    const aggregate = scopedRows(queryState.aggregateKpis, args);
    const total = sum(current, 'estimates_count');
    const previousTotal = sum(previous, 'estimates_count');
    const gmv = sum(current, 'gmv');
    return {
      data: {
        kpis: {
          total_estimates_this_period: total,
          total_estimates_prev_period: previousTotal,
          total_estimates_growth_pct: previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : 0,
          total_gmv_this_period: gmv,
          total_gmv_prev_period: sum(previous, 'gmv'),
          aov: total > 0 ? gmv / total : 0,
          open_estimates_this_period: sum(current, 'open_count'),
          converted_this_period: sum(current, 'converted_count'),
          open_total: sum(aggregate, 'open_count'),
          open_drafts: sum(aggregate, 'draft_count'),
          open_sent: sum(aggregate, 'sent_count'),
          open_accepted: sum(aggregate, 'accepted_count'),
          ready_to_convert: sum(aggregate, 'accepted_count'),
          expiring_soon: sum(aggregate, 'expiring_soon_count'),
          open_created_this_period: sum(current, 'open_count'),
          buyer_app_created_this_period: sum(current, 'open_buyer_app_count'),
        },
      },
      error: null,
    };
  });

  return {
    supabaseAdmin: {
      auth: {
        admin: {
          getUserById: vi.fn(async (userId: string) => ({
            data: {
              user: {
                id: userId,
                email: `${userId}@yukti.so`,
                user_metadata: { full_name: userId === 'u-seller' ? 'Priya Shah' : 'Team Member' },
              },
            },
            error: null,
          })),
        },
      },
      schema: vi.fn(() => ({ from, rpc })),
    },
  };
});

import { NextRequest } from 'next/server';
import { GET } from '../../app/api/tenant/estimates/route';

describe('estimates landing API route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    getVerifiedClaimsMock.mockReset();
    estimateKpiCallState.count = 0;
    queryState.buyers = [{ id: 'b1', business_name: 'Acme Retail', geography: { city: 'Mumbai', state: 'MH' } }];
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const sentOld = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    queryState.estimates = [
      {
        id: 'e1',
        location_id: 'loc-1',
        estimate_number: 'EST-2026-0001',
        buyer_id: 'b1',
        status: 'accepted',
        total_amount: 50000,
        estimate_date: '2026-06-01T10:00:00.000Z',
        created_at: '2026-06-01T10:00:00.000Z',
        sent_at: '2026-06-01T11:00:00.000Z',
        accepted_at: '2026-06-02T10:00:00.000Z',
        expires_at: soon,
        source: 'buyer_app',
        is_buyer_app_estimate: true,
        campaign_id: 'c1',
        updated_at: '2026-06-02T10:00:00.000Z',
      },
      {
        id: 'e2',
        location_id: 'loc-2',
        estimate_number: 'EST-2026-0002',
        buyer_id: 'b1',
        status: 'sent',
        total_amount: 12000,
        estimate_date: '2026-06-03T10:00:00.000Z',
        created_at: '2026-06-03T10:00:00.000Z',
        sent_at: sentOld,
        accepted_at: null,
        expires_at: null,
        source: 'buyer_app',
        is_buyer_app_estimate: true,
        campaign_id: 'c1',
        updated_at: '2026-06-03T10:00:00.000Z',
      },
      {
        id: 'e3',
        location_id: null,
        estimate_number: 'EST-2026-0003',
        buyer_id: 'b1',
        status: 'draft',
        total_amount: 8000,
        estimate_date: '2026-06-04T10:00:00.000Z',
        created_at: '2026-06-04T10:00:00.000Z',
        sent_at: null,
        accepted_at: null,
        expires_at: soon,
        source: 'seller',
        is_buyer_app_estimate: false,
        campaign_id: null,
        created_by: 'u-seller',
        updated_at: '2026-06-04T10:00:00.000Z',
      },
      {
        id: 'e4',
        location_id: 'loc-1',
        estimate_number: 'EST-2026-0004',
        buyer_id: 'b1',
        status: 'converted',
        total_amount: 2000,
        estimate_date: '2026-05-01T10:00:00.000Z',
        created_at: '2026-05-01T10:00:00.000Z',
        sent_at: '2026-05-02T10:00:00.000Z',
        accepted_at: '2026-06-05T12:00:00.000Z',
        expires_at: null,
        source: 'seller',
        is_buyer_app_estimate: false,
        campaign_id: 'c2',
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
    queryState.currentKpis = [
      {
        scope: 'tenant',
        location_id: null,
        day: '2026-06-01',
        estimates_count: 3,
        gmv: 70000,
        open_count: 3,
        accepted_count: 1,
        converted_count: 1,
        draft_count: 1,
        sent_count: 1,
        expiring_soon_count: 2,
        open_buyer_app_count: 2,
      },
      {
        scope: 'location',
        location_id: 'loc-1',
        day: '2026-06-01',
        estimates_count: 1,
        gmv: 50000,
        open_count: 1,
        accepted_count: 1,
        converted_count: 0,
        draft_count: 0,
        sent_count: 0,
        expiring_soon_count: 1,
        open_buyer_app_count: 1,
      },
      {
        scope: 'location',
        location_id: 'loc-2',
        day: '2026-06-01',
        estimates_count: 1,
        gmv: 12000,
        open_count: 1,
        accepted_count: 0,
        converted_count: 0,
        draft_count: 0,
        sent_count: 1,
        expiring_soon_count: 0,
        open_buyer_app_count: 1,
      },
    ];
    queryState.previousKpis = [
      {
        scope: 'tenant',
        location_id: null,
        day: '2026-05-01',
        estimates_count: 1,
        gmv: 2000,
        open_count: 0,
        accepted_count: 0,
        converted_count: 1,
        draft_count: 0,
        sent_count: 0,
        expiring_soon_count: 0,
        open_buyer_app_count: 0,
      },
      {
        scope: 'location',
        location_id: 'loc-1',
        day: '2026-05-01',
        estimates_count: 1,
        gmv: 2000,
        open_count: 0,
        accepted_count: 0,
        converted_count: 1,
        draft_count: 0,
        sent_count: 0,
        expiring_soon_count: 0,
        open_buyer_app_count: 0,
      },
    ];
    queryState.aggregateKpis = [
      {
        scope: 'tenant',
        location_id: null,
        open_count: 3,
        draft_count: 1,
        sent_count: 1,
        accepted_count: 1,
        expiring_soon_count: 2,
      },
      {
        scope: 'location',
        location_id: 'loc-1',
        open_count: 1,
        draft_count: 0,
        sent_count: 0,
        accepted_count: 1,
        expiring_soon_count: 1,
      },
      {
        scope: 'location',
        location_id: 'loc-2',
        open_count: 1,
        draft_count: 0,
        sent_count: 1,
        accepted_count: 0,
        expiring_soon_count: 0,
      },
    ];
    queryState.snapshot = {
      total_count: 4,
      draft_count: 1,
      sent_count: 1,
      accepted_count: 1,
      expiring_soon: 2,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('filters estimates to the assistant location scope', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_assistant', location_ids: ['loc-1'] });

    const res = await GET(new NextRequest('http://localhost/api/tenant/estimates?period=month'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.estimates).toHaveLength(1);
    expect(body.estimates[0].id).toBe('e1');
    expect(body.kpis.total_estimates_this_period).toBe(1);
    expect(body.kpis.open_total).toBe(1);
  });
});
