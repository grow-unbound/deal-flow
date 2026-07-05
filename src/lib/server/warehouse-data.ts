import { normalizeLocationAddress } from '@/lib/locations/location-deactivate-guards';
import { computeSellableUnits, computeWarehouseInitials, computeWarehouseStockStatus, isIdleStockSku } from '@/lib/server/warehouse-metrics';
import type { TenantWarehouse } from '@/types/tenant-warehouses';
import type { WarehouseDetailResponse } from '@/types/tenant-warehouses';

export interface WarehouseInventoryRow {
  warehouse_id: string;
  tenant_product_id: string;
  qty_available: number;
  qty_reserved: number;
  reorder_point: number | null;
  updated_at: string;
  product_name?: string;
  brand_name?: string;
}

export function hydrateWarehouse(row: Record<string, unknown>): TenantWarehouse {
  const location = row.locations;
  const locationRecord = location && typeof location === 'object'
    ? {
        id: typeof (location as Record<string, unknown>).id === 'string' ? String((location as Record<string, unknown>).id) : '',
        name: typeof (location as Record<string, unknown>).name === 'string' ? String((location as Record<string, unknown>).name) : '',
        is_default: (location as Record<string, unknown>).is_default === true,
      }
    : null;

  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    location_id: typeof row.location_id === 'string' ? row.location_id : null,
    name: String(row.name ?? ''),
    address: normalizeLocationAddress(row.address),
    phone_number: typeof row.phone_number === 'string' ? row.phone_number : null,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    is_default: row.is_default === true,
    external_ref: typeof row.external_ref === 'string' ? row.external_ref : null,
    associated_users: Array.isArray(row.associated_users) ? row.associated_users as TenantWarehouse['associated_users'] : [],
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    location: locationRecord?.id ? locationRecord : null,
  };
}

export async function loadTenantWarehouses(
  db: any,
  tenantId: string,
  options?: { includeDeleted?: boolean; limit?: number; id?: string },
) {
  let query = db
    .schema('app')
    .from('warehouses')
    .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default)')
    .eq('tenant_id', tenantId);

  if (!options?.includeDeleted) {
    query = query.is('deleted_at', null);
  }

  if (options?.id) {
    query = query.eq('id', options.id);
  }

  if (options?.limit != null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Record<string, unknown>[]).map(hydrateWarehouse);
}

export async function loadWarehouseInventoryRows(
  db: any,
  warehouseIds: string[],
  includeProductMeta = false,
) {
  if (warehouseIds.length === 0) return [] as WarehouseInventoryRow[];

  const select = 'warehouse_id, tenant_product_id, qty_available, qty_reserved, reorder_point, updated_at';

  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select(select)
    .in('warehouse_id', warehouseIds)
    .is('deleted_at', null);

  if (error) {
    throw error;
  }

  const baseRows: WarehouseInventoryRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    warehouse_id: String(row.warehouse_id),
    tenant_product_id: String(row.tenant_product_id),
    qty_available: Number(row.qty_available ?? 0),
    qty_reserved: Number(row.qty_reserved ?? 0),
    reorder_point: row.reorder_point == null ? null : Number(row.reorder_point),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  }));

  if (!includeProductMeta || baseRows.length === 0) {
    return baseRows;
  }

  const productIds = Array.from(new Set(baseRows.map((row) => row.tenant_product_id)));
  const { data: products, error: productsError } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, name, tenant_brands(name)')
    .in('id', productIds)
    .is('deleted_at', null);

  if (productsError) {
    throw productsError;
  }

  const productMeta = new Map<string, { product_name?: string; brand_name?: string }>();
  for (const row of (products ?? []) as Array<Record<string, unknown>>) {
    const brand = row.tenant_brands as Record<string, unknown> | null | undefined;
    productMeta.set(String(row.id), {
      product_name: typeof row.name === 'string' ? row.name : undefined,
      brand_name: typeof brand?.name === 'string' ? brand.name : undefined,
    });
  }

  return baseRows.map((row) => {
    const meta = productMeta.get(row.tenant_product_id);
    return {
      warehouse_id: String(row.warehouse_id),
      tenant_product_id: row.tenant_product_id,
      qty_available: row.qty_available,
      qty_reserved: row.qty_reserved,
      reorder_point: row.reorder_point,
      updated_at: row.updated_at,
      product_name: meta?.product_name,
      brand_name: meta?.brand_name,
    } satisfies WarehouseInventoryRow;
  });
}

export async function loadWarehouseDetail(
  db: any,
  tenantId: string,
  warehouseId: string,
): Promise<WarehouseDetailResponse | null> {
  const warehouses = await loadTenantWarehouses(db, tenantId, { id: warehouseId });
  const warehouse = warehouses[0];
  if (!warehouse) return null;

  const inventoryRows = await loadWarehouseInventoryRows(db, [warehouse.id], true);
  const latestDemandByProduct = await loadLatestDemandByProduct(
    db,
    Array.from(new Set(inventoryRows.map((row) => row.tenant_product_id))),
  );

  const stock = inventoryRows
    .map((row) => {
      const sellableUnits = computeSellableUnits(row.qty_available, row.qty_reserved);
      const lastDemandAt = latestDemandByProduct.get(row.tenant_product_id) ?? null;
      return {
        tenant_product_id: row.tenant_product_id,
        product_name: row.product_name ?? 'Untitled product',
        brand_name: row.brand_name ?? '—',
        qty_available: row.qty_available,
        qty_reserved: row.qty_reserved,
        sellable_units: sellableUnits,
        reorder_point: row.reorder_point,
        stock_status: computeWarehouseStockStatus(row.qty_available, row.qty_reserved, row.reorder_point),
        last_updated: row.updated_at,
        last_demand_at: lastDemandAt,
        is_idle: isIdleStockSku(sellableUnits, lastDemandAt),
      };
    })
    .sort((a, b) => a.product_name.localeCompare(b.product_name));

  const trackedSkus = stock.length;
  const sellableUnits = stock.reduce((sum, row) => sum + row.sellable_units, 0);
  const lowStockSkus = stock.filter((row) => row.stock_status === 'low_stock').length;
  const stockoutSkus = stock.filter((row) => row.stock_status === 'out_of_stock').length;
  const idleStockSkus = stock.filter((row) => row.is_idle).length;
  const reorderTriggeredSkus = lowStockSkus + stockoutSkus;
  const lastInventoryUpdate = stock.reduce<string | null>((latest, row) => {
    if (!latest || row.last_updated > latest) return row.last_updated;
    return latest;
  }, null);

  return {
    id: warehouse.id,
    name: warehouse.name,
    initials: computeWarehouseInitials(warehouse.name),
    status: warehouse.status,
    is_default: warehouse.is_default,
    city: warehouse.address.city,
    state: warehouse.address.state,
    phone_number: warehouse.phone_number,
    external_ref: warehouse.external_ref,
    lat: warehouse.lat,
    lng: warehouse.lng,
    linked_location: warehouse.location,
    address: warehouse.address,
    associated_users: warehouse.associated_users,
    created_at: warehouse.created_at,
    updated_at: warehouse.updated_at,
    meta_strip: {
      tracked_skus: trackedSkus,
      sellable_units: sellableUnits,
      low_stock_skus: reorderTriggeredSkus,
      idle_stock_skus: idleStockSkus,
    },
    details: {
      associated_users_count: warehouse.associated_users.length,
      stockout_skus: stockoutSkus,
      reorder_triggered_skus: reorderTriggeredSkus,
      last_inventory_update: lastInventoryUpdate,
    },
    performance: {
      inventory_health: {
        active_skus: trackedSkus,
        low_stock_skus: lowStockSkus,
        stockout_skus: stockoutSkus,
        avg_sellable_per_sku: trackedSkus > 0 ? Math.round(sellableUnits / trackedSkus) : null,
      },
      stock_posture: {
        sellable_units: sellableUnits,
        reorder_triggered_skus: reorderTriggeredSkus,
        is_default: warehouse.is_default,
        linked_location_name: warehouse.location?.name ?? null,
      },
      idle_stock: stock
        .filter((row) => row.is_idle)
        .sort((a, b) => b.sellable_units - a.sellable_units)
        .slice(0, 5)
        .map((row) => ({
          tenant_product_id: row.tenant_product_id,
          product_name: row.product_name,
          brand_name: row.brand_name,
          sellable_units: row.sellable_units,
          last_demand_at: row.last_demand_at,
        })),
      recent_replenishment: [...stock]
        .sort((a, b) => b.last_updated.localeCompare(a.last_updated))
        .slice(0, 5)
        .map((row) => ({
          tenant_product_id: row.tenant_product_id,
          product_name: row.product_name,
          brand_name: row.brand_name,
          qty_available: row.qty_available,
          qty_reserved: row.qty_reserved,
          updated_at: row.last_updated,
        })),
    },
    stock,
  };
}

export async function loadLatestDemandByProduct(
  db: any,
  tenantProductIds: string[],
) {
  if (tenantProductIds.length === 0) return new Map<string, string>();

  const { data, error } = await db
    .schema('app')
    .from('order_items')
    .select('tenant_product_id, created_at')
    .in('tenant_product_id', tenantProductIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const latest = new Map<string, string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const productId = typeof row.tenant_product_id === 'string' ? row.tenant_product_id : null;
    const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
    if (!productId || !createdAt || latest.has(productId)) continue;
    latest.set(productId, createdAt);
  }
  return latest;
}
