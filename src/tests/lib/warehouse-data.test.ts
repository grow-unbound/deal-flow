import { describe, expect, it, vi } from 'vitest';

import { bucketWarehouseInventoryTrend, loadLatestDemandByProduct } from '@/lib/server/warehouse-data';

function makeUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('loadLatestDemandByProduct', () => {
  it('chunks large product id lists to avoid PostgREST URL overflow', async () => {
    const productIds = Array.from({ length: 165 }, (_, index) => makeUuid(index + 1));
    const inCalls: string[][] = [];

    const db = {
      schema: () => ({
        from: () => ({
          select: () => ({
            in: (_column: string, ids: string[]) => {
              inCalls.push(ids);
              return {
                is: () => ({
                  order: async () => ({
                    data: ids.map((tenant_product_id, index) => ({
                      tenant_product_id,
                      created_at: `2026-07-0${(index % 9) + 1}T10:00:00.000Z`,
                    })),
                    error: null,
                  }),
                }),
              };
            },
          }),
        }),
      }),
    };

    const latest = await loadLatestDemandByProduct(db, productIds);

    expect(inCalls).toHaveLength(3);
    expect(inCalls[0]).toHaveLength(80);
    expect(inCalls[1]).toHaveLength(80);
    expect(inCalls[2]).toHaveLength(5);
    expect(latest.size).toBe(165);
    expect(latest.get(makeUuid(1))).toBe('2026-07-01T10:00:00.000Z');
  });
});

describe('bucketWarehouseInventoryTrend', () => {
  it('buckets daily inventory posture rows into ISO weeks', () => {
    const trend = bucketWarehouseInventoryTrend([
      { day: '2026-06-02', tracked_skus: 10, sellable_units: 100, low_stock_skus: 1, stockout_skus: 0 },
      { day: '2026-06-03', tracked_skus: 12, sellable_units: 120, low_stock_skus: 2, stockout_skus: 1 },
      { day: '2026-06-09', tracked_skus: 15, sellable_units: 150, low_stock_skus: 3, stockout_skus: 1 },
    ]);

    expect(trend).toHaveLength(2);
    expect(trend[0]?.tracked_skus).toBe(12);
    expect(trend[1]?.sellable_units).toBe(150);
  });
});
