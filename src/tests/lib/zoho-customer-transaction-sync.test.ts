import { describe, expect, it } from 'vitest';

import { persistZohoEntityPage } from '../../../supabase/functions/_shared/integrations-persist';

function createAdminStub(options?: {
  tableRows?: Record<string, Array<Record<string, unknown>>>;
}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const tableRows = options?.tableRows ?? {};

  function filterRows(tableName: string, state: {
    eq: Record<string, unknown>;
    in: { column: string; values: string[] } | null;
    is: Record<string, unknown>;
    like: { column: string; pattern: string } | null;
    gt: { column: string; value: unknown } | null;
  }) {
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

      if (state.like) {
        const value = String(row[state.like.column] ?? '');
        const regex = new RegExp(`^${state.like.pattern.replace(/[%]/g, '.*')}$`);
        if (!regex.test(value)) return false;
      }

      if (state.gt) {
        const currentValue = row[state.gt.column];
        if (currentValue === null || currentValue === undefined || currentValue <= state.gt.value) return false;
      }

      return true;
    });
  }

  function queryChain(tableName: string) {
    const state: {
      eq: Record<string, unknown>;
      in: { column: string; values: string[] } | null;
      is: Record<string, unknown>;
      like: { column: string; pattern: string } | null;
      gt: { column: string; value: unknown } | null;
    } = {
      eq: {},
      in: null,
      is: {},
      like: null,
      gt: null,
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
      like: (column: string, pattern: string) => {
        state.like = { column, pattern };
        return chain;
      },
      gt: (column: string, value: unknown) => {
        state.gt = { column, value };
        return chain;
      },
      maybeSingle: async () => {
        const rows = filterRows(tableName, state);
        return { data: rows[0] ?? null, error: null };
      },
      update: () => chain,
      then: (resolve: (result: { data: Array<Record<string, unknown>>; error: null }) => void) => {
        resolve({ data: filterRows(tableName, state), error: null });
      },
    };

    return chain;
  }

  return {
    rpcCalls,
    client: {
      schema: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });

          if (fn === 'bulk_persist_jsonb_records') {
            const rows = Array.isArray(args.p_rows) ? args.p_rows as Array<Record<string, unknown>> : [];

            if (args.p_table === 'integration_entity_map') {
              return { data: [], error: null };
            }

            return {
              data: rows.map((row, index) => ({
                id: `${String(args.p_table)}-${index + 1}`,
                ...row,
              })),
              error: null,
            };
          }

          return { data: null, error: null };
        },
        from: (tableName: string) => queryChain(tableName),
      }),
    },
  };
}

describe('zoho customer and transaction persistence', () => {
  it('dedupes customer, contact person, and price list assignment upserts within a single page', async () => {
    const admin = createAdminStub({
      tableRows: {
        price_lists: [
          {
            tenant_id: 'tenant-1',
            external_ref: 'PB-1',
            id: 'price-list-1',
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
      'customers',
      'zoho_books',
      [
        {
          contact_id: 'CUST-1',
          company_name: 'Acme Retail',
          contact_name: 'Asha',
          pricebook_id: 'PB-1',
          contact_persons: [
            {
              contact_person_id: 'CP-1',
              first_name: 'Asha',
              email: 'asha@example.com',
            },
          ],
        },
        {
          contact_id: 'CUST-1',
          company_name: 'Acme Retail Updated',
          contact_name: 'Asha',
          pricebook_id: 'PB-1',
          contact_persons: [
            {
              contact_person_id: 'CP-1',
              first_name: 'Asha',
              email: 'asha@example.com',
            },
          ],
        },
      ],
    );

    const buyersCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'buyers'
    ));
    const buyerUsersCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'buyer_users'
    ));
    const assignmentsCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'price_list_assignments'
    ));

    expect(Array.isArray(buyersCall?.args.p_rows)).toBe(true);
    expect(buyersCall?.args.p_rows as unknown[]).toHaveLength(1);
    expect(Array.isArray(buyerUsersCall?.args.p_rows)).toBe(true);
    expect(buyerUsersCall?.args.p_rows as unknown[]).toHaveLength(1);
    expect(Array.isArray(assignmentsCall?.args.p_rows)).toBe(true);
    expect(assignmentsCall?.args.p_rows as unknown[]).toHaveLength(1);
  });

  it.each([
    {
      label: 'estimate number collision',
      entityType: 'estimates',
      idField: 'estimate_id',
      numberField: 'estimate_number',
      existingRows: {
        estimates: [
          {
            id: 'estimate-existing',
            tenant_id: 'tenant-1',
            external_ref: 'EST-legacy',
            estimate_number: 'EST-2026-0001',
            deleted_at: null,
          },
        ],
      },
      records: [
        {
          estimate_id: 'EST-A',
          estimate_number: 'EST-2026-0001',
          status: 'draft',
          date: '2026-06-25',
          line_items: [],
        },
        {
          estimate_id: 'EST-B',
          estimate_number: 'EST-2026-0001',
          status: 'draft',
          date: '2026-06-25',
          line_items: [],
        },
      ],
      expectedId: 'estimate-existing',
    },
    {
      label: 'order number collision',
      entityType: 'orders',
      idField: 'salesorder_id',
      numberField: 'salesorder_number',
      existingRows: {
        orders: [
          {
            id: 'order-existing',
            tenant_id: 'tenant-1',
            external_ref: 'SO-legacy',
            order_number: 'SO-2026-0001',
            deleted_at: null,
          },
        ],
      },
      records: [
        {
          salesorder_id: 'SO-A',
          salesorder_number: 'SO-2026-0001',
          status: 'open',
          date: '2026-06-25',
          line_items: [],
        },
        {
          salesorder_id: 'SO-B',
          salesorder_number: 'SO-2026-0001',
          status: 'open',
          date: '2026-06-25',
          line_items: [],
        },
      ],
      expectedId: 'order-existing',
    },
    {
      label: 'invoice number collision',
      entityType: 'invoices',
      idField: 'invoice_id',
      numberField: 'invoice_number',
      existingRows: {
        invoices: [
          {
            id: 'invoice-existing',
            tenant_id: 'tenant-1',
            external_ref: 'INV-legacy',
            invoice_number: 'INV-2026-0001',
            deleted_at: null,
          },
        ],
      },
      records: [
        {
          invoice_id: 'INV-A',
          invoice_number: 'INV-2026-0001',
          status: 'sent',
          date: '2026-06-25',
          line_items: [],
        },
        {
          invoice_id: 'INV-B',
          invoice_number: 'INV-2026-0001',
          status: 'sent',
          date: '2026-06-25',
          line_items: [],
        },
      ],
      expectedId: 'invoice-existing',
    },
  ] as const)('reuses the existing row for $label', async ({ existingRows, records, entityType, expectedId }) => {
    const admin = createAdminStub({
      tableRows: existingRows,
    });

    await persistZohoEntityPage(
      admin.client as never,
      'tenant-1',
      'user-1',
      'integration-1',
      entityType,
      'zoho_books',
      records as Array<Record<string, unknown>>,
    );

    const persistedCall = admin.rpcCalls.find((call) => call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === entityType);
    expect(persistedCall).toBeTruthy();
    const persistedRows = Array.isArray(persistedCall?.args.p_rows) ? persistedCall?.args.p_rows as Array<Record<string, unknown>> : [];
    expect(persistedRows).toHaveLength(1);
    expect(persistedRows[0]?.id).toBe(expectedId);
  });

  it.each([
    ['estimates', 'estimate_id', 'EST-1'],
    ['orders', 'salesorder_id', 'SO-1'],
    ['invoices', 'invoice_id', 'INV-1'],
  ] as const)('falls back place_of_supply to Unknown for %s', async (entityType, idField, externalId) => {
    const admin = createAdminStub();

    await persistZohoEntityPage(
      admin.client as never,
      'tenant-1',
      'user-1',
      'integration-1',
      entityType,
      'zoho_books',
      [
        {
          [idField]: externalId,
          date: '2026-06-25',
          total: 1500,
          status: 'open',
          line_items: [],
        },
      ],
    );

    const persistCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === entityType
    ));

    expect(persistCall).toBeTruthy();
    expect((persistCall?.args.p_rows as Array<Record<string, unknown>>)[0]?.place_of_supply).toBe('Unknown');
  });

  it('dedupes repeated product and inventory rows within the same sync page', async () => {
    const admin = createAdminStub({
      tableRows: {
        warehouses: [
          {
            tenant_id: 'tenant-1',
            external_ref: 'LOC-1',
            id: 'warehouse-1',
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
          name: 'Switch',
          brand: 'Acme',
          category_id: 'CAT-1',
          category_name: 'Switches',
          item_locations: [
            { location_id: 'LOC-1', quantity: 4 },
            { location_id: 'LOC-1', quantity: 4 },
          ],
        },
        {
          item_id: 'ITEM-1',
          name: 'Switch Updated',
          brand: 'Acme',
          category_id: 'CAT-1',
          category_name: 'Switches',
          item_locations: [
            { location_id: 'LOC-1', quantity: 7 },
          ],
        },
      ],
    );

    const brandsCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'tenant_brands'
    ));
    const productsCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'tenant_products'
    ));
    const inventoryCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'tenant_inventory'
    ));

    expect(brandsCall?.args.p_rows as unknown[]).toHaveLength(2);
    expect(productsCall?.args.p_rows as unknown[]).toHaveLength(1);
    expect(inventoryCall?.args.p_rows as unknown[]).toHaveLength(1);
  });

  it('dedupes repeated pricelist and pricelist item rows within the same sync page', async () => {
    const admin = createAdminStub({
      tableRows: {
        tenant_products: [
          {
            tenant_id: 'tenant-1',
            external_ref: 'ITEM-1',
            id: 'product-1',
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
      'pricelists',
      'zoho_books',
      [
        {
          pricebook_id: 'PB-1',
          name: 'Retail',
          pricebook_type: 'sales',
          pricebook_items: [
            { item_id: 'ITEM-1', min_quantity: 1, price: 100 },
            { item_id: 'ITEM-1', min_quantity: 1, price: 100 },
          ],
        },
        {
          pricebook_id: 'PB-1',
          name: 'Retail Updated',
          pricebook_type: 'sales',
          pricebook_items: [
            { item_id: 'ITEM-1', min_quantity: 1, price: 105 },
          ],
        },
      ],
    );

    const priceListsCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'price_lists'
    ));
    const priceListItemsCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'price_list_items'
    ));

    expect(priceListsCall?.args.p_rows as unknown[]).toHaveLength(1);
    expect(priceListItemsCall?.args.p_rows as unknown[]).toHaveLength(1);
  });

  it.each([
    ['estimates', 'estimate_id', 'EST-1', 'estimate_items'],
    ['orders', 'salesorder_id', 'SO-1', 'order_items'],
    ['invoices', 'invoice_id', 'INV-1', 'invoice_items'],
  ] as const)('persists %s line items when product mappings resolve', async (entityType, idField, externalId, childTable) => {
    const admin = createAdminStub({
      tableRows: {
        tenant_products: [
          {
            tenant_id: 'tenant-1',
            external_ref: 'ITEM-1',
            id: 'product-1',
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
      entityType,
      'zoho_books',
      [
        {
          [idField]: externalId,
          customer_id: 'CUST-1',
          status: 'sent',
          total: 100,
          line_items: [
            {
              item_id: 'ITEM-1',
              quantity: 1,
              rate: 100,
              item_total: 100,
            },
          ],
        },
      ],
    );

    const childCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === childTable
    ));

    expect(Array.isArray(childCall?.args.p_rows)).toBe(true);
    expect(childCall?.args.p_rows as unknown[]).toHaveLength(1);
  });

  it('fails fast and records an error reason when a transactional line item cannot resolve a product', async () => {
    const admin = createAdminStub();

    await expect(
      persistZohoEntityPage(
        admin.client as never,
        'tenant-1',
        'user-1',
        'integration-1',
        'orders',
        'zoho_books',
        [
          {
            salesorder_id: 'SO-1',
            customer_id: 'CUST-1',
            status: 'open',
            total: 100,
            line_items: [
              {
                item_id: 'ITEM-404',
                quantity: 1,
                rate: 100,
                item_total: 100,
              },
            ],
          },
        ],
      ),
    ).rejects.toThrow('Unable to resolve product ITEM-404 for order SO-1.');

    const errorMapCall = admin.rpcCalls
      .filter((call) => call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'integration_entity_map')
      .at(-1);

    expect(errorMapCall).toBeTruthy();
    expect(Array.isArray(errorMapCall?.args.p_rows)).toBe(true);
    expect((errorMapCall?.args.p_rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      sync_status: 'error',
    });
    expect(String((errorMapCall?.args.p_rows as Array<Record<string, unknown>>)[0]?.error_reason ?? '')).toContain(
      'Unable to resolve product ITEM-404 for order SO-1.',
    );
  });
});
