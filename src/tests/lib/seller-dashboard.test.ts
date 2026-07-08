import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFlagMock = vi.fn();
const loadBuyerCreditSnapshotsMock = vi.fn();
const getSellerShellFeatureAvailabilityMock = vi.fn();

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/server/buyer-credit', () => ({
  loadBuyerCreditSnapshots: (...args: unknown[]) => loadBuyerCreditSnapshotsMock(...args),
}));

vi.mock('@/lib/server/seller-features', () => ({
  getSellerShellFeatureAvailability: (...args: unknown[]) => getSellerShellFeatureAvailabilityMock(...args),
}));

vi.mock('@/lib/server/seller-location-access', () => ({
  locationScopeCacheKey: (claims: { location_ids?: string[] | null; role?: string | null }) =>
    claims.role === 'seller_admin' ? 'all' : (claims.location_ids ?? []).join(',') || 'none',
  getSellerLocationScope: (claims: { location_ids?: string[] | null; role?: string | null }) => {
    if (claims.role === 'seller_admin') return { mode: 'all', locationIds: null };
    if (claims.location_ids?.length) return { mode: 'subset', locationIds: claims.location_ids };
    return { mode: 'none', locationIds: [] };
  },
  loadAccessibleSellerLocations: vi.fn(async (_db: unknown, _tenantId: string, claims: { location_ids?: string[] | null; role?: string | null }) => {
    const all = [
      { id: 'loc-1', name: 'North Hub' },
      { id: 'loc-2', name: 'South Hub' },
    ];
    return claims.role === 'seller_admin'
      ? all
      : all.filter((location) => claims.location_ids?.includes(location.id));
  }),
  applySellerLocationScope: <T extends { in: (column: string, values: string[]) => T; eq: (column: string, value: string) => T }>(
    query: T,
    claims: { location_ids?: string[] | null; role?: string | null },
  ) => {
    if (claims.role === 'seller_admin') return query;
    if (claims.location_ids?.length) return query.in('location_id', claims.location_ids);
    return query.eq('location_id', '00000000-0000-0000-0000-000000000000');
  },
}));

vi.mock('@/lib/supabase', () => {
  const state = {
    buyers: [
      { id: 'buyer-1', business_name: 'A One Retail', credit_limit: 1000, geography: { city: 'Mumbai' } },
      { id: 'buyer-2', business_name: 'B Two Retail', credit_limit: 800, geography: { city: 'Pune' } },
    ],
    catalogs: [
      { id: 'cat-1', name: 'Monsoon Push', status: 'published', valid_to: '2026-07-15T00:00:00.000Z', updated_at: '2026-07-05T00:00:00.000Z' },
    ],
    inventory: [
      { tenant_product_id: 'tp-1', warehouse_id: 'wh-1', qty_available: 4, reorder_point: 5, warehouses: { location_id: 'loc-1' } },
      { tenant_product_id: 'tp-2', warehouse_id: 'wh-2', qty_available: 50, reorder_point: 10, warehouses: { location_id: 'loc-2' } },
    ],
    orders: [
      { id: 'order-1', location_id: 'loc-1', buyer_id: 'buyer-1', order_number: 'SO-1', status: 'received', total_amount: 1000, order_date: '2026-07-05T00:00:00.000Z', placed_at: null, created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-07-05T01:00:00.000Z' },
      { id: 'order-2', location_id: 'loc-2', buyer_id: 'buyer-2', order_number: 'SO-2', status: 'received', total_amount: 500, order_date: '2026-07-06T00:00:00.000Z', placed_at: null, created_at: '2026-06-02T00:00:00.000Z', updated_at: '2026-07-06T01:00:00.000Z' },
      { id: 'order-3', location_id: 'loc-1', buyer_id: 'buyer-1', order_number: 'SO-3', status: 'delivered', total_amount: 900, order_date: '2026-05-01T00:00:00.000Z', placed_at: null, created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T01:00:00.000Z' },
    ],
    estimates: [
      { id: 'estimate-1', location_id: 'loc-1', buyer_id: 'buyer-1', estimate_number: 'EST-1', status: 'sent', total_amount: 700, estimate_date: '2026-07-04T00:00:00.000Z', created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-07-04T01:00:00.000Z' },
      { id: 'estimate-2', location_id: 'loc-2', buyer_id: 'buyer-2', estimate_number: 'EST-2', status: 'draft', total_amount: 300, estimate_date: '2026-07-02T00:00:00.000Z', created_at: '2026-06-02T00:00:00.000Z', updated_at: '2026-07-02T01:00:00.000Z' },
    ],
    invoices: [
      { id: 'invoice-1', location_id: 'loc-1', buyer_id: 'buyer-1', invoice_number: 'INV-1', status: 'sent', total_amount: 400, outstanding_balance: 200, invoice_date: '2026-07-03T00:00:00.000Z', due_date: '2026-07-04T00:00:00.000Z', created_at: '2026-07-03T00:00:00.000Z', updated_at: '2026-07-03T01:00:00.000Z' },
      { id: 'invoice-2', location_id: 'loc-2', buyer_id: 'buyer-2', invoice_number: 'INV-2', status: 'paid', total_amount: 600, outstanding_balance: 0, invoice_date: '2026-07-02T00:00:00.000Z', due_date: '2026-07-03T00:00:00.000Z', created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T01:00:00.000Z' },
    ],
    currentKpis: [{ orders_count: 9, gmv: 50000 }],
    previousKpis: [{ orders_count: 4, gmv: 20000 }],
    tenant: { id: 'tenant-1', business_name: 'WineYard', subdomain: 'wineyard', plan: 'growth' },
  };

  class QueryBuilder {
    table: string;
    filters: Array<{ kind: 'eq' | 'in'; column: string; value: unknown }> = [];
    kpiWindow: 'current' | 'previous' = 'current';

    constructor(table: string, kpiWindow: 'current' | 'previous' = 'current') {
      this.table = table;
      this.kpiWindow = kpiWindow;
    }

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ kind: 'eq', column, value });
      return this;
    }

    in(column: string, value: unknown) {
      this.filters.push({ kind: 'in', column, value });
      return this;
    }

    is() {
      return this;
    }

    gte(column: string, value: unknown) {
      if (this.table === 'kpi_tenant_daily' && column === 'day') {
        this.kpiWindow = String(value).startsWith('2026-07') ? 'current' : 'previous';
      }
      return this;
    }

    lt() {
      return this;
    }

    order() {
      return this;
    }

    single() {
      return Promise.resolve({ data: state.tenant, error: null });
    }

    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      const applyFilters = (rows: Array<Record<string, unknown>>) => {
        let result = [...rows];
        for (const filter of this.filters) {
          if (filter.kind === 'eq') {
            result = result.filter((row) => !(filter.column in row) || row[filter.column] === filter.value);
            continue;
          }
          const values = Array.isArray(filter.value) ? filter.value : [];
          result = result.filter((row) => values.includes(row[filter.column]));
        }
        return result;
      };

      if (this.table === 'buyers') return resolve({ data: state.buyers, error: null });
      if (this.table === 'campaigns') return resolve({ data: state.catalogs, error: null });
      if (this.table === 'tenant_inventory') return resolve({ data: applyFilters(state.inventory as Array<Record<string, unknown>>), error: null });
      if (this.table === 'orders') return resolve({ data: applyFilters(state.orders as Array<Record<string, unknown>>), error: null });
      if (this.table === 'estimates') return resolve({ data: applyFilters(state.estimates as Array<Record<string, unknown>>), error: null });
      if (this.table === 'invoices') return resolve({ data: applyFilters(state.invoices as Array<Record<string, unknown>>), error: null });
      if (this.table === 'kpi_tenant_daily') {
        return resolve({ data: this.kpiWindow === 'current' ? state.currentKpis : state.previousKpis, error: null });
      }
      return resolve({ data: [], error: null });
    }
  }

  return {
    supabaseAdmin: {
      schema: vi.fn(() => ({
        from: vi.fn((table: string) => new QueryBuilder(table)),
      })),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: { last_sign_in_at: null } }, error: null }),
        },
      },
    },
  };
});

import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { getSellerDashboardData } from '@/lib/server/seller-dashboard';

describe('seller dashboard aggregation', () => {
  beforeEach(() => {
    getFlagMock.mockReset();
    loadBuyerCreditSnapshotsMock.mockReset();
    getSellerShellFeatureAvailabilityMock.mockReset();

    getFlagMock.mockResolvedValue(false);
    loadBuyerCreditSnapshotsMock.mockResolvedValue(new Map([
      ['buyer-1', { outstanding_dues: 200 }],
      ['buyer-2', { outstanding_dues: 0 }],
    ]));
    getSellerShellFeatureAvailabilityMock.mockResolvedValue({
      estimates: true,
      salesOrders: true,
      invoices: true,
      customerMaster: true,
      tallyExport: false,
    });
  });

  it('uses aggregate tenant KPIs for admin summary cards and hints', async () => {
    const period = getSellerLandingPeriodMeta('month', new Date('2026-07-10T00:00:00.000Z'));
    const dashboard = await getSellerDashboardData('tenant-1', { role: 'seller_admin', sub: 'admin-1', location_ids: null }, period);

    expect(dashboard.admin?.metrics[0]?.value).toBe(9);
    expect(dashboard.admin?.metrics[1]?.value).toBe(50000);
    expect(dashboard.admin?.callouts[0]?.hint).toBe('9 in scope');
  });

  it('keeps assistant metrics scoped to assigned locations', async () => {
    const period = getSellerLandingPeriodMeta('month', new Date('2026-07-10T00:00:00.000Z'));
    const dashboard = await getSellerDashboardData('tenant-1', { role: 'seller_assistant', sub: 'assistant-1', location_ids: ['loc-1'] }, period);

    expect(dashboard.tenant.location_names).toEqual(['North Hub']);
    expect(dashboard.assistant?.metrics.find((metric) => metric.label === 'Orders to confirm')?.value).toBe(1);
    expect(dashboard.assistant?.metrics.find((metric) => metric.label === 'Open estimates')?.value).toBe(1);
    expect(dashboard.assistant?.feeds.find((feed) => feed.id === 'sales_orders')?.rows.map((row) => row.document_number)).toEqual(['SO-1', 'SO-3']);
    expect(dashboard.assistant?.callouts.find((callout) => callout.eyebrow === 'Needs action')?.rows.map((row) => row.name)).toEqual(['A One Retail']);
    expect(dashboard.assistant?.callouts.find((callout) => callout.eyebrow === 'Recent activity')?.hint).toBe('This Month');
  });
});
