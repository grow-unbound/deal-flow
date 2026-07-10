import type { SupabaseClient } from '@supabase/supabase-js';

export type BuyerCartStockLine = {
  tenant_product_id: string;
  qty: number;
  unit_price: number;
  gst_rate?: number | null;
  product_name?: string;
};

type ProductRow = {
  id: string;
  name_override: string | null;
  internal_sku: string | null;
};

type InventoryRow = {
  tenant_product_id: string;
  qty_available: number | null;
};

export async function validateBuyerCartStock(
  db: SupabaseClient,
  params: {
    tenantId: string;
    warehouseId: string | null;
    items: BuyerCartStockLine[];
  },
): Promise<{ ok: true; items: BuyerCartStockLine[] } | { ok: false; status: number; error: string }> {
  const { tenantId, warehouseId, items } = params;
  if (!warehouseId) {
    return { ok: false, status: 400, error: 'Select a delivery location that can be routed to a warehouse.' };
  }

  const ids = Array.from(new Set(items.map((item) => item.tenant_product_id).filter(Boolean)));
  if (ids.length === 0) {
    return { ok: false, status: 400, error: 'Cart must have at least one valid item.' };
  }

  const { data: productsData, error: productsError } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, name_override, internal_sku')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (productsError) throw new Error(productsError.message);

  const productMap = new Map(((productsData ?? []) as ProductRow[]).map((row) => [row.id, row]));
  const validIds = Array.from(productMap.keys());
  if (validIds.length === 0) {
    return { ok: false, status: 400, error: 'Cart items are no longer available.' };
  }

  const { data: inventoryData, error: inventoryError } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available')
    .eq('warehouse_id', warehouseId)
    .in('tenant_product_id', validIds)
    .is('deleted_at', null);
  if (inventoryError) throw new Error(inventoryError.message);

  const qtyByProductId = new Map<string, number>();
  for (const row of (inventoryData ?? []) as InventoryRow[]) {
    qtyByProductId.set(
      row.tenant_product_id,
      (qtyByProductId.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
    );
  }

  const outOfStock = items.filter((item) => {
    if (!productMap.has(item.tenant_product_id)) return true;
    return Math.max(0, qtyByProductId.get(item.tenant_product_id) ?? 0) <= 0;
  });

  if (outOfStock.length > 0) {
    const first = outOfStock[0]!;
    const product = productMap.get(first.tenant_product_id);
    const name = first.product_name || product?.name_override || product?.internal_sku || 'One item';
    const suffix = outOfStock.length > 1 ? ` and ${outOfStock.length - 1} more item(s)` : '';
    return {
      ok: false,
      status: 409,
      error: `${name}${suffix} is out of stock for the selected delivery location.`,
    };
  }

  return { ok: true, items };
}
