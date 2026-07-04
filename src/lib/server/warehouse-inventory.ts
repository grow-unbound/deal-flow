export async function loadInventoryAvailabilityMap(
  db: any,
  productIds: string[],
  locationId?: string | null,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  let query = db
    .schema('app')
    .from('tenant_inventory')
    .select(
      locationId
        ? 'tenant_product_id, qty_available, warehouses!inner(location_id)'
        : 'tenant_product_id, qty_available',
    )
    .in('tenant_product_id', productIds)
    .is('deleted_at', null);

  if (locationId) {
    query = query.eq('warehouses.location_id', locationId);
  }

  const { data } = await query;
  const inventoryMap = new Map<string, number>();

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const productId = typeof row.tenant_product_id === 'string' ? row.tenant_product_id : null;
    if (!productId) continue;
    inventoryMap.set(
      productId,
      (inventoryMap.get(productId) ?? 0) + Number(row.qty_available ?? 0),
    );
  }

  return inventoryMap;
}
