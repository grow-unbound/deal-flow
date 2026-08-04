import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buyerUniverseForQuery,
  fetchCustomersLandingTable,
} from '@/lib/server/customers-landing-table';

describe('buyerUniverseForQuery', () => {
  it('uses .in() only for small universes', () => {
    const small = Array.from({ length: 40 }, (_, i) => `id-${i}`);
    expect(buyerUniverseForQuery(small)).toEqual({ inIds: small, scanSet: null });

    const large = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const result = buyerUniverseForQuery(large);
    expect(result.inIds).toBeNull();
    expect(result.scanSet?.size).toBe(200);
  });
});

type QueryResult = { data: unknown; error: { message: string } | null };

/**
 * Tracks period_summary queries by whether they used `.gt('invoice_count', 0)` + `.limit`
 * (purchaser set / dormant scan) vs `.in('buyer_id', …)` (display hydrate).
 */
function makeDormantDb(handlers: {
  thisQuarterPurchaserIds: string[];
  previousQuarterRows: Array<Record<string, unknown>>;
  nowByBuyerId?: Record<string, Record<string, unknown>>;
}) {
  const nowByBuyerId = handlers.nowByBuyerId ?? {};
  let periodPurchaserSetDone = false;
  let periodScanDone = false;

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    let sawGtInvoice = false;
    let sawIn = false;

    const resolve = (): Promise<QueryResult> => {
      if (table === 'metrics_buyer_period_summary') {
        if (sawIn) {
          return Promise.resolve({ data: [], error: null });
        }
        if (sawGtInvoice && !periodPurchaserSetDone) {
          periodPurchaserSetDone = true;
          return Promise.resolve({
            data: handlers.thisQuarterPurchaserIds.map((buyer_id) => ({ buyer_id })),
            error: null,
          });
        }
        if (sawGtInvoice && !periodScanDone) {
          periodScanDone = true;
          return Promise.resolve({
            data: handlers.previousQuarterRows,
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      }
      if (table === 'metrics_buyer_now_summary') {
        if (sawIn) {
          const ids = (chain as { __inIds?: string[] }).__inIds ?? [];
          return Promise.resolve({
            data: ids.map((id) => nowByBuyerId[id]).filter(Boolean),
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      }
      if (table === 'buyers') {
        return Promise.resolve({
          data: [{ id: 'dormant-1', business_name: 'Dormant Buyer', phone: '9876543210', is_active: true, buyer_app_enabled: true }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    };

    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.gt = vi.fn().mockImplementation((col: string) => {
      if (col === 'invoice_count') sawGtInvoice = true;
      return chain;
    });
    chain.ilike = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.or = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockImplementation((_col: string, ids: string[]) => {
      sawIn = true;
      (chain as { __inIds?: string[] }).__inIds = ids;
      return chain;
    });
    chain.is = vi.fn().mockImplementation(() => {
      // Terminal for buyers / hydrate paths that end with .is('deleted_at', null)
      if (sawIn || table === 'buyers') return resolve();
      return chain;
    });
    chain.limit = vi.fn().mockImplementation(() => resolve());
    chain.maybeSingle = vi.fn().mockImplementation(() => resolve());

    return chain;
  });

  return {
    schema: vi.fn(() => ({ from })),
  };
}

describe('fetchCustomersLandingTable dormant preset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns last-quarter purchasers with no this-quarter invoices', async () => {
    const db = makeDormantDb({
      thisQuarterPurchaserIds: ['active-1'],
      previousQuarterRows: [
        {
          buyer_id: 'active-1',
          external_ref: 'A1',
          invoice_value: 9000,
          invoice_count: 2,
          estimate_value: 0,
          estimate_count: 0,
          order_value: 0,
          order_count: 0,
          app_demand_value: 0,
          app_demand_count: 0,
        },
        {
          buyer_id: 'dormant-1',
          external_ref: 'D1',
          invoice_value: 5000,
          invoice_count: 1,
          estimate_value: 0,
          estimate_count: 0,
          order_value: 0,
          order_count: 0,
          app_demand_value: 1200,
          app_demand_count: 2,
        },
      ],
      nowByBuyerId: {
        'dormant-1': {
          buyer_id: 'dormant-1',
          external_ref: 'D1',
          receivable_amount: 1000,
          overdue_amount: 0,
          credit_limit: 10000,
          credit_available: 8000,
        },
      },
    });

    const result = await fetchCustomersLandingTable(db as never, {
      tenantId: 'tenant-1',
      limit: 25,
      cursor: null,
      sort: 'invoice_value',
      search: null,
      filterPreset: { dormant_period: 'this_quarter' },
    });

    expect(result.buyers).toHaveLength(1);
    expect(result.buyers[0]?.id).toBe('dormant-1');
    expect(result.buyers[0]?.business_name).toBe('Dormant Buyer');
    expect(result.buyers[0]?.buyer_app_enabled).toBe(true);
    expect(result.buyers[0]?.phone).toBe('9876543210');
    expect(result.buyers[0]?.invoice_value).toBe(0);
    expect(result.buyers[0]?.app_demand_value).toBe(0);
    expect(result.buyers[0]?.receivable_amount).toBe(1000);
    expect(result.sort).toBe('invoice_value');
  });
});
