import { describe, expect, it } from 'vitest';

import { persistZohoEntityPage } from '../../../supabase/functions/_shared/integrations-persist';

function createAdminStub() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  return {
    rpcCalls,
    client: {
      schema: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });

          if (fn === 'bulk_persist_jsonb_records') {
            if (args.p_table === 'tenant_categories') {
              return {
                data: [
                  {
                    id: 'category-1',
                    external_ref: 'zoho_cat:cat-1',
                    name: 'Switches',
                  },
                ],
                error: null,
              };
            }

            if (args.p_table === 'tenant_brands') {
              return {
                data: [
                  {
                    id: 'brand-1',
                    external_ref: 'zoho_brand:acme',
                    display_name_override: 'Acme',
                  },
                  {
                    id: 'brand-import',
                    external_ref: 'zoho_brand:__import__',
                    display_name_override: 'Zoho Import',
                  },
                ],
                error: null,
              };
            }

            if (args.p_table === 'tenant_products') {
              return {
                data: [
                  {
                    id: 'product-1',
                    external_ref: 'ITEM-1',
                  },
                  {
                    id: 'product-2',
                    external_ref: 'ITEM-2',
                  },
                ],
                error: null,
              };
            }

            if (args.p_table === 'integration_entity_map') {
              return { data: [], error: null };
            }

            return { data: [], error: null };
          }

          if (fn === 'rebuild_tenant_products_search_vectors') {
            return { data: null, error: null };
          }

          return { data: [], error: null };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                is: async () => ({ data: [], error: null }),
              }),
              is: async () => ({ data: [], error: null, count: 0 }),
            }),
          }),
        }),
      }),
    },
  };
}

describe('zoho products sync persistence', () => {
  it('does not fetch or persist pricelists during the products phase', async () => {
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
          rate: 1200,
        },
        {
          item_id: 'ITEM-2',
          name: 'Acme Router',
          brand: 'Acme',
          category_id: 'cat-1',
          category_name: 'Switches',
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

  it('dedupes category upserts across items in the same batch', async () => {
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
          rate: 1200,
        },
        {
          item_id: 'ITEM-2',
          name: 'Acme Router',
          brand: 'Acme',
          category_id: 'cat-1',
          category_name: 'Switches',
          rate: 2200,
        },
      ],
    );

    const categoryCall = admin.rpcCalls.find((call) => (
      call.fn === 'bulk_persist_jsonb_records' && call.args.p_table === 'tenant_categories'
    ));

    expect(categoryCall).toBeTruthy();
    expect(Array.isArray(categoryCall?.args.p_rows)).toBe(true);
    expect((categoryCall?.args.p_rows as unknown[])).toHaveLength(1);
  });
});
