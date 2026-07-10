import { describe, expect, it } from 'vitest';
import { validateBuyerCartStock } from '@/lib/server/buyer-cart-stock';

function chain(result: unknown) {
  const api: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is']) {
    api[method] = () => api;
  }
  api.then = (resolve: (value: unknown) => void) => resolve(result);
  return api;
}

describe('buyer cart stock validation', () => {
  it('rejects items with no stock in the selected warehouse', async () => {
    const db = {
      schema: () => ({
        from: (table: string) => {
          if (table === 'tenant_products') {
            return chain({
              data: [{ id: 'tp-1', name_override: 'Camera', internal_sku: 'SKU-1' }],
              error: null,
            });
          }
          if (table === 'tenant_inventory') {
            return chain({
              data: [{ tenant_product_id: 'tp-1', qty_available: 0 }],
              error: null,
            });
          }
          throw new Error(`Unexpected table ${table}`);
        },
      }),
    };

    const result = await validateBuyerCartStock(db as any, {
      tenantId: 'tenant-1',
      warehouseId: 'wh-1',
      items: [{ tenant_product_id: 'tp-1', qty: 1, unit_price: 1000, product_name: 'Camera' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('Camera');
    }
  });
});
