import { describe, expect, it, vi } from 'vitest';

// source_payload is written to R2 (not inline jsonb) by batchUpsertEntityMap
// — mock the R2 write so tests don't need a real S3 client / Deno env.
vi.mock('../../../supabase/functions/_shared/r2.ts', () => ({
  putObjectJson: vi.fn().mockResolvedValue(undefined),
}));

import { persistZohoEntityPage } from '../../../supabase/functions/_shared/integrations-persist';

type TableRow = Record<string, unknown>;

function createAdminStub(options?: { tableRows?: Record<string, TableRow[]> }) {
  const tableRows = options?.tableRows ?? {};
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const activityLog: Array<
    | { kind: 'rpc'; table: string }
    | { kind: 'db-upsert'; table: string; rows: TableRow[] }
  > = [];
  const nextIds = new Map<string, number>();

  function filterRows(
    tableName: string,
    state: {
      eq: Record<string, unknown>;
      in: { column: string; values: string[] } | null;
      is: Record<string, unknown>;
    },
  ) {
    return (tableRows[tableName] ?? []).filter((row) => {
      for (const [column, value] of Object.entries(state.eq)) {
        if (row[column] !== value) return false;
      }

      if (state.in) {
        const currentValue = row[state.in.column];
        if (!state.in.values.includes(String(currentValue ?? ''))) return false;
      }

      for (const [column, value] of Object.entries(state.is)) {
        if (value === null && row[column] !== null && row[column] !== undefined) return false;
      }

      return true;
    });
  }

  function mergeRow(tableName: string, row: TableRow) {
    const existingRows = tableRows[tableName] ?? [];
    const rowId = typeof row.id === 'string' ? row.id : null;
    const filtered = rowId
      ? existingRows.filter((existing) => existing.id !== rowId)
      : existingRows.slice();
    filtered.push(row);
    tableRows[tableName] = filtered;
  }

  function makeChain(tableName: string) {
    const state: {
      eq: Record<string, unknown>;
      in: { column: string; values: string[] } | null;
      is: Record<string, unknown>;
      pendingUpsert: TableRow[] | null;
    } = {
      eq: {},
      in: null,
      is: {},
      pendingUpsert: null,
    };

    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        state.eq[column] = value;
        return chain;
      },
      in: (column: string, values: string[]) => {
        state.in = { column, values };
        return chain;
      },
      is: (column: string, value: unknown) => {
        state.is[column] = value;
        return chain;
      },
      upsert: (rows: TableRow | TableRow[], _options?: Record<string, unknown>) => {
        state.pendingUpsert = Array.isArray(rows) ? rows : [rows];
        return chain;
      },
      maybeSingle: async () => {
        if (state.pendingUpsert) {
          const persistedRows = state.pendingUpsert.map((row) => {
            const id = typeof row.id === 'string'
              ? row.id
              : `${tableName}-${(nextIds.get(tableName) ?? 0) + 1}`;
            nextIds.set(tableName, (nextIds.get(tableName) ?? 0) + 1);
            const persisted = { ...row, id };
            mergeRow(tableName, persisted);
            return persisted;
          });
          activityLog.push({ kind: 'db-upsert', table: tableName, rows: persistedRows });
          state.pendingUpsert = null;
          return { data: persistedRows[0] ?? null, error: null };
        }

        return { data: filterRows(tableName, state)[0] ?? null, error: null };
      },
      single: async () => {
        if (state.pendingUpsert) {
          const persistedRows = state.pendingUpsert.map((row) => {
            const id = typeof row.id === 'string'
              ? row.id
              : `${tableName}-${(nextIds.get(tableName) ?? 0) + 1}`;
            nextIds.set(tableName, (nextIds.get(tableName) ?? 0) + 1);
            const persisted = { ...row, id };
            mergeRow(tableName, persisted);
            return persisted;
          });
          activityLog.push({ kind: 'db-upsert', table: tableName, rows: persistedRows });
          state.pendingUpsert = null;
          return { data: persistedRows[0] ?? null, error: null };
        }

        const rows = filterRows(tableName, state);
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: (result: { data: Array<Record<string, unknown>>; error: null }) => void) => {
        resolve({ data: filterRows(tableName, state), error: null });
      },
    };

    return chain;
  }

  return {
    rpcCalls,
    activityLog,
    client: {
      schema: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });

          if (fn === 'bulk_persist_jsonb_records') {
            activityLog.push({ kind: 'rpc', table: String(args.p_table ?? '') });
            const rows = Array.isArray(args.p_rows) ? (args.p_rows as TableRow[]) : [];
            return {
              data: rows.map((row, index) => ({
                id: typeof row.id === 'string' ? row.id : `${String(args.p_table)}-${index + 1}`,
                ...row,
              })),
              error: null,
            };
          }

          if (fn === 'rebuild_tenant_products_search_vectors') {
            return { data: null, error: null };
          }

          return { data: null, error: null };
        },
        from: (tableName: string) => makeChain(tableName),
      }),
    },
  };
}

describe('zoho products sync persistence', () => {
  it('keeps product sync bounded to products and does not touch pricelists', async () => {
    const admin = createAdminStub();

    await persistZohoEntityPage(
      admin.client as never,
      'tenant-1',
      'user-1',
      'integration-1',
      'products',
      'zoho_books',
      [
        {
          item_id: 'ITEM-1',
          name: 'Acme PoE Switch',
          brand: 'Acme',
          category_id: 'cat-1',
          category_name: 'Switches',
          sku: 'SKU-1',
          rate: 1200,
        },
        {
          item_id: 'ITEM-2',
          name: 'Acme Router',
          brand: 'Acme',
          category_id: 'cat-1',
          category_name: 'Switches',
          sku: 'SKU-2',
          rate: 2200,
        },
      ],
    );

    const touchedTables = admin.rpcCalls
      .filter((call) => call.fn === 'bulk_persist_jsonb_records')
      .map((call) => String(call.args.p_table));

    expect(touchedTables).toContain('tenant_products');
    expect(touchedTables).not.toContain('price_lists');
    expect(touchedTables).not.toContain('price_list_items');
  });

  it.each([
    {
      label: 'category slug collision',
      targetTable: 'tenant_categories',
      existingRows: {
        tenant_categories: [
          {
            id: 'category-existing',
            tenant_id: 'tenant-1',
            slug: 'switches',
            external_ref: 'zoho_cat:legacy',
            deleted_at: null,
          },
        ],
      },
      records: [
        {
          item_id: 'ITEM-1',
          name: 'Switch Alpha',
          brand: 'Acme',
          category_id: 'CAT-A',
          category_name: 'Switches',
          sku: 'SKU-1',
          rate: 100,
        },
        {
          item_id: 'ITEM-2',
          name: 'Switch Beta',
          brand: 'Acme',
          category_id: 'CAT-B',
          category_name: 'Switches',
          sku: 'SKU-2',
          rate: 120,
        },
      ],
      expectedId: 'category-existing',
    },
    {
      label: 'brand slug collision',
      targetTable: 'tenant_brands',
      expectedCount: 2,
      existingRows: {
        tenant_brands: [
          {
            id: 'brand-existing',
            tenant_id: 'tenant-1',
            slug: 'acme',
            external_ref: 'zoho_brand:legacy',
            display_name_override: 'Acme',
            deleted_at: null,
          },
        ],
      },
      records: [
        {
          item_id: 'ITEM-3',
          name: 'Acme Camera',
          brand: 'Acme',
          sku: 'SKU-3',
          rate: 900,
        },
        {
          item_id: 'ITEM-4',
          name: 'Acme DVR',
          brand: 'Acme',
          sku: 'SKU-4',
          rate: 1800,
        },
      ],
      expectedId: 'brand-existing',
    },
    {
      label: 'product internal SKU collision',
      targetTable: 'tenant_products',
      existingRows: {
        tenant_brands: [
          {
            id: 'brand-existing',
            tenant_id: 'tenant-1',
            slug: 'acme',
            external_ref: 'zoho_brand:legacy',
            display_name_override: 'Acme',
            deleted_at: null,
          },
        ],
        tenant_products: [
          {
            id: 'product-existing',
            tenant_id: 'tenant-1',
            external_ref: 'ITEM-legacy',
            internal_sku: 'SKU-1',
            deleted_at: null,
          },
        ],
      },
      records: [
        {
          item_id: 'ITEM-5',
          name: 'Acme Switch One',
          brand: 'Acme',
          sku: 'SKU-1',
          rate: 100,
        },
        {
          item_id: 'ITEM-6',
          name: 'Acme Switch Two',
          brand: 'Acme',
          sku: 'SKU-1',
          rate: 120,
        },
      ],
      expectedId: 'product-existing',
    },
  ] as const)('reuses the existing row for $label', async ({ existingRows, records, targetTable, expectedId, expectedCount }) => {
    const admin = createAdminStub({ tableRows: existingRows });

    await persistZohoEntityPage(
      admin.client as never,
      'tenant-1',
      'user-1',
      'integration-1',
      'products',
      'zoho_books',
      records as Array<Record<string, unknown>>,
    );

    const persistedCall = admin.rpcCalls.find((call) => call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === targetTable);
    expect(persistedCall).toBeTruthy();
    const persistedRows = Array.isArray(persistedCall?.args.p_rows) ? persistedCall?.args.p_rows as Array<Record<string, unknown>> : [];
    expect(persistedRows).toHaveLength(expectedCount ?? 1);
    expect(persistedRows[0]?.id).toBe(expectedId);
  });

  it('creates a missing warehouse before inventory persistence in the webhook-style product path', async () => {
    const admin = createAdminStub();

    await persistZohoEntityPage(
      admin.client as never,
      'tenant-1',
      'user-1',
      'integration-1',
      'products',
      'zoho_books',
      [
        {
          item_id: 'ITEM-1',
          name: 'Acme Switch',
          brand: 'Acme',
          sku: 'SKU-1',
          item_locations: [
            {
              warehouse_id: 'WH-1',
              warehouse_name: 'North Hub',
              warehouse_available_stock: 12,
              warehouse_reserved_stock: 3,
              reorder_level: 5,
            },
          ],
        },
      ],
    );

    const warehouseUpsertIndex = admin.activityLog.findIndex((entry) => entry.kind === 'db-upsert' && entry.table === 'warehouses');
    const inventoryPersistIndex = admin.activityLog.findIndex((entry) => entry.kind === 'rpc' && entry.table === 'tenant_inventory');

    expect(warehouseUpsertIndex).toBeGreaterThanOrEqual(0);
    expect(inventoryPersistIndex).toBeGreaterThan(warehouseUpsertIndex);
  });

  it('reuses an existing warehouse instead of creating a duplicate before inventory persistence', async () => {
    const admin = createAdminStub({
      tableRows: {
        warehouses: [
          {
            id: 'warehouse-existing',
            tenant_id: 'tenant-1',
            external_ref: 'WH-1',
            name: 'North Hub',
            deleted_at: null,
          },
        ],
      },
    });

    await persistZohoEntityPage(
      admin.client as never,
      'tenant-1',
      'user-1',
      'integration-1',
      'products',
      'zoho_books',
      [
        {
          item_id: 'ITEM-1',
          name: 'Acme Switch',
          brand: 'Acme',
          sku: 'SKU-1',
          item_locations: [
            {
              warehouse_id: 'WH-1',
              warehouse_name: 'North Hub',
              warehouse_available_stock: 12,
              warehouse_reserved_stock: 3,
              reorder_level: 5,
            },
          ],
        },
      ],
    );

    expect(admin.activityLog.some((entry) => entry.kind === 'db-upsert' && entry.table === 'warehouses')).toBe(false);

    const inventoryPersist = admin.rpcCalls.find((call) => call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'tenant_inventory');
    expect(Array.isArray(inventoryPersist?.args.p_rows)).toBe(true);
    expect((inventoryPersist?.args.p_rows as Array<Record<string, unknown>>)).toHaveLength(1);
    expect((inventoryPersist?.args.p_rows as Array<Record<string, unknown>>)[0]?.warehouse_id).toBe('warehouse-existing');
  });
});
