import { describe, expect, it, vi } from 'vitest';

import { bucketWarehouseInventoryTrend, loadLatestDemandByProduct, loadWarehouseInventoryRows } from '@/lib/server/warehouse-data';

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

describe('loadWarehouseInventoryRows', () => {
  it('resolves brand names without selecting a non-existent tenant_brands.name column', async () => {
    const selectCalls: string[] = [];

    const db = {
      schema: (schemaName: string) => ({
        from: (table: string) => ({
          select: (columns: string) => {
            selectCalls.push(`${schemaName}.${table}:${columns}`);

            if (schemaName === 'app' && table === 'tenant_inventory') {
              return {
                in: () => ({
                  is: async () => ({
                    data: [
                      {
                        warehouse_id: 'warehouse-1',
                        tenant_product_id: 'product-1',
                        qty_available: 12,
                        qty_reserved: 2,
                        reorder_point: 5,
                        updated_at: '2026-07-06T10:00:00.000Z',
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            }

            if (schemaName === 'app' && table === 'tenant_products') {
              return {
                in: () => ({
                  is: async () => ({
                    data: [
                      {
                        id: 'product-1',
                        name_override: 'Waterproof Flashlight',
                        tenant_brand_id: 'brand-1',
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            }

            if (schemaName === 'app' && table === 'tenant_brands') {
              return {
                in: () => ({
                  is: async () => ({
                    data: [
                      {
                        id: 'brand-1',
                        display_name_override: null,
                        master_brand_id: 'master-brand-1',
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            }

            if (schemaName === 'catalog' && table === 'brands') {
              return {
                in: async () => ({
                  data: [{ id: 'master-brand-1', name: 'Acme Lighting' }],
                  error: null,
                }),
              };
            }

            throw new Error(`Unexpected query ${schemaName}.${table}:${columns}`);
          },
        }),
      }),
    };

    const rows = await loadWarehouseInventoryRows(db as never, ['warehouse-1'], true);

    expect(selectCalls).toContain('app.tenant_brands:id, display_name_override, master_brand_id');
    expect(selectCalls).toContain('catalog.brands:id, name');
    expect(rows).toEqual([
      {
        warehouse_id: 'warehouse-1',
        tenant_product_id: 'product-1',
        sku: 'product-1',
        qty_available: 12,
        qty_reserved: 2,
        reorder_point: 5,
        updated_at: '2026-07-06T10:00:00.000Z',
        product_name: 'Waterproof Flashlight',
        brand_name: 'Acme Lighting',
      },
    ]);
  });
});
