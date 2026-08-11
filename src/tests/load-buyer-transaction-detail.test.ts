import { describe, expect, it } from 'vitest';
import { loadBuyerDocumentLineItems } from '@/lib/buyer-documents/load-buyer-transaction-detail';

function buildMockDb({
  itemRows,
  tenantProducts,
  masterProducts,
}: {
  itemRows: unknown[];
  tenantProducts: unknown[];
  masterProducts: unknown[];
}) {
  return {
    schema(name: 'app' | 'catalog') {
      return {
        from(table: string) {
          return {
            select() {
              if (name === 'app' && table === 'estimate_items') {
                return {
                  eq() {
                    return {
                      is: async () => ({ data: itemRows, error: null }),
                    };
                  },
                };
              }
              if (name === 'app' && table === 'tenant_products') {
                return {
                  eq() {
                    return {
                      in() {
                        return {
                          is: async () => ({ data: tenantProducts, error: null }),
                        };
                      },
                    };
                  },
                };
              }
              if (name === 'catalog' && table === 'products') {
                return {
                  in: async () => ({ data: masterProducts, error: null }),
                };
              }
              throw new Error(`Unexpected query: ${name}.${table}`);
            },
          };
        },
      };
    },
  };
}

describe('loadBuyerDocumentLineItems', () => {
  it('hydrates buyer document line images from tenant products with master fallback', async () => {
    const db = buildMockDb({
      itemRows: [
        {
          tenant_product_id: 'tp-1',
          qty: 2,
          unit_price: 500,
          tax_rate: 18,
          line_total: 1000,
          deleted_at: null,
        },
        {
          tenant_product_id: 'tp-2',
          qty: 1,
          unit_price: 750,
          tax_rate: 18,
          line_total: 750,
          deleted_at: null,
        },
      ],
      tenantProducts: [
        {
          id: 'tp-1',
          internal_sku: 'SKU-1',
          name_override: 'Tenant Camera',
          master_product_id: 'mp-1',
          default_uom: 'pc',
          image_urls: ['https://cdn.example.com/tenant-camera.webp'],
        },
        {
          id: 'tp-2',
          internal_sku: 'SKU-2',
          name_override: null,
          master_product_id: 'mp-2',
          default_uom: 'box',
          image_urls: [],
        },
      ],
      masterProducts: [
        { id: 'mp-1', name: 'Master Camera', image_urls: ['https://cdn.example.com/master-camera.webp'] },
        { id: 'mp-2', name: 'Master Recorder', image_urls: ['https://cdn.example.com/master-recorder.webp'] },
      ],
    });

    const result = await loadBuyerDocumentLineItems(db as never, 'tenant-1', 'estimates', 'est-1');

    expect(result).toEqual([
      expect.objectContaining({
        tenant_product_id: 'tp-1',
        product_name: 'Tenant Camera',
        image_url: 'https://cdn.example.com/tenant-camera.webp',
      }),
      expect.objectContaining({
        tenant_product_id: 'tp-2',
        product_name: 'Master Recorder',
        image_url: 'https://cdn.example.com/master-recorder.webp',
      }),
    ]);
  });
});
