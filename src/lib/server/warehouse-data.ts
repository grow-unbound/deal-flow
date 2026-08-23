import { normalizeLocationAddress } from '@/lib/locations/location-deactivate-guards';
import { normalizeLocationAssociatedUsers } from '@/lib/location-assignees';
import { firstStoredImageUrl } from '@/lib/r2-url';
import { matchesWarehouseStockStatuses } from '@/lib/server/product-stock-status';
import { computeSellableUnits, computeWarehouseInitials, computeWarehouseStockStatus, isIdleStockSku } from '@/lib/server/warehouse-metrics';
import type { TenantWarehouse, WarehouseDetailInventoryItem, WarehouseDetailResponse, WarehouseInventoryTrendWeek } from '@/types/tenant-warehouses';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';

/** PostgREST `.in()` filters are serialized into the URL; keep chunks under ~16KB. */
export const POSTGREST_IN_CHUNK_SIZE = 80;

export function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export interface WarehouseInventoryRow {
  warehouse_id: string;
  tenant_product_id: string;
  sku?: string;
  qty_available: number;
  qty_reserved: number;
  reorder_point: number | null;
  updated_at: string;
  product_name?: string;
  brand_name?: string;
  image_url?: string | null;
}

export function hydrateWarehouse(row: Record<string, unknown>): TenantWarehouse {
  const location = row.locations;
  const locationRecord = location && typeof location === 'object'
    ? {
        id: typeof (location as Record<string, unknown>).id === 'string' ? String((location as Record<string, unknown>).id) : '',
        name: typeof (location as Record<string, unknown>).name === 'string' ? String((location as Record<string, unknown>).name) : '',
        is_default: (location as Record<string, unknown>).is_default === true,
        associated_users: normalizeLocationAssociatedUsers((location as Record<string, unknown>).associated_users),
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
    .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default, associated_users)')
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
  preloadedRows?: Array<Record<string, unknown>>,
) {
  if (warehouseIds.length === 0) return [] as WarehouseInventoryRow[];

  let rawRows = preloadedRows;
  if (!rawRows) {
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
    rawRows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const baseRows: WarehouseInventoryRow[] = rawRows.map((row) => ({
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
  const products: Array<Record<string, unknown>> = [];
  for (const productChunk of chunkArray(productIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data, error } = await db
      .schema('app')
      .from('tenant_products')
      .select('id, name_override, internal_sku, tenant_brand_id, image_urls')
      .in('id', productChunk)
      .is('deleted_at', null);

    if (error) {
      throw error;
    }

    products.push(...((data ?? []) as Array<Record<string, unknown>>));
  }

  const tenantBrandIds = Array.from(
    new Set(
      ((products ?? []) as Array<Record<string, unknown>>)
        .map((row) => (typeof row.tenant_brand_id === 'string' ? row.tenant_brand_id : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let brandNameById = new Map<string, string>();
  if (tenantBrandIds.length > 0) {
    const tenantBrands: Array<Record<string, unknown>> = [];
    for (const brandChunk of chunkArray(tenantBrandIds, POSTGREST_IN_CHUNK_SIZE)) {
      const { data, error } = await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id')
        .in('id', brandChunk)
        .is('deleted_at', null);

      if (error) {
        throw error;
      }

      tenantBrands.push(...((data ?? []) as Array<Record<string, unknown>>));
    }

    const masterBrandIds = Array.from(
      new Set(
        tenantBrands
          .map((row) => (typeof row.master_brand_id === 'string' ? row.master_brand_id : null))
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let masterBrandNameById = new Map<string, string>();
    if (masterBrandIds.length > 0) {
      const masterBrands: Array<Record<string, unknown>> = [];
      for (const brandChunk of chunkArray(masterBrandIds, POSTGREST_IN_CHUNK_SIZE)) {
        const { data, error } = await db
          .schema('catalog')
          .from('brands')
          .select('id, name')
          .in('id', brandChunk);

        if (error) {
          throw error;
        }

        masterBrands.push(...((data ?? []) as Array<Record<string, unknown>>));
      }

      masterBrandNameById = new Map(
        masterBrands.map((row) => [
          String(row.id),
          typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '—',
        ]),
      );
    }

    brandNameById = new Map(
      tenantBrands.map((row) => {
        const brandId = String(row.id);
        const brandName =
          typeof row.display_name_override === 'string' && row.display_name_override.trim()
            ? row.display_name_override.trim()
            : typeof row.master_brand_id === 'string'
              ? masterBrandNameById.get(row.master_brand_id) ?? '—'
              : '—';
        return [brandId, brandName];
      }),
    );
  }

  const productMeta = new Map<string, {
    product_name?: string;
    sku?: string;
    brand_name?: string;
    image_url?: string | null;
  }>();
  for (const row of products) {
    const brandId = typeof row.tenant_brand_id === 'string' ? row.tenant_brand_id : null;
    productMeta.set(String(row.id), {
      product_name: typeof row.name_override === 'string' ? row.name_override : undefined,
      sku: typeof row.internal_sku === 'string' ? row.internal_sku : undefined,
      brand_name: brandId ? brandNameById.get(brandId) : undefined,
      image_url: firstStoredImageUrl(row.image_urls),
    });
  }

  return baseRows.map((row) => {
    const meta = productMeta.get(row.tenant_product_id);
    return {
      warehouse_id: String(row.warehouse_id),
      tenant_product_id: row.tenant_product_id,
      sku: meta?.sku ?? row.tenant_product_id,
      qty_available: row.qty_available,
      qty_reserved: row.qty_reserved,
      reorder_point: row.reorder_point,
      updated_at: row.updated_at,
      product_name: meta?.product_name,
      brand_name: meta?.brand_name,
      image_url: meta?.image_url ?? null,
    } satisfies WarehouseInventoryRow;
  });
}

export interface WarehouseStockPageResult {
  items: WarehouseDetailInventoryItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export function bucketWarehouseInventoryTrend(
  dailyRows: Array<{
    day: string;
    tracked_skus: number;
    sellable_units: number;
    low_stock_skus: number;
    stockout_skus: number;
  }>,
): WarehouseInventoryTrendWeek[] {
  const weekBuckets = new Map<string, WarehouseInventoryTrendWeek>();

  for (const row of dailyRows) {
    const d = new Date(row.day);
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dow + 6) % 7));
    const key = monday.toISOString().split('T')[0]!;
    const existing = weekBuckets.get(key) ?? {
      week_label: monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      week_start: key,
      tracked_skus: 0,
      sellable_units: 0,
      low_stock_skus: 0,
      stockout_skus: 0,
    };
    existing.tracked_skus = Math.max(existing.tracked_skus, row.tracked_skus);
    existing.sellable_units = Math.max(existing.sellable_units, row.sellable_units);
    existing.low_stock_skus = Math.max(existing.low_stock_skus, row.low_stock_skus);
    existing.stockout_skus = Math.max(existing.stockout_skus, row.stockout_skus);
    weekBuckets.set(key, existing);
  }

  return [...weekBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, value]) => value);
}

async function hydrateInventoryItems(
  baseRows: WarehouseInventoryRow[],
  latestDemandByProduct: Map<string, string>,
): Promise<WarehouseDetailInventoryItem[]> {
  return baseRows
    .map((row) => {
      const sellableUnits = computeSellableUnits(row.qty_available, row.qty_reserved);
      const lastDemandAt = latestDemandByProduct.get(row.tenant_product_id) ?? null;
      return {
        tenant_product_id: row.tenant_product_id,
        sku: row.sku ?? row.tenant_product_id,
        product_name: row.product_name ?? 'Untitled product',
        brand_name: row.brand_name ?? '—',
        qty_available: row.qty_available,
        qty_reserved: row.qty_reserved,
        sellable_units: sellableUnits,
        reorder_point: row.reorder_point,
        stock_status: computeWarehouseStockStatus(row.qty_available, row.qty_reserved, row.reorder_point),
        image_url: row.image_url ?? null,
        last_updated: row.updated_at,
        last_demand_at: lastDemandAt,
        is_idle: isIdleStockSku(sellableUnits, lastDemandAt),
      };
    })
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

export async function loadWarehouseStockPage(
  db: any,
  warehouseId: string,
  options?: {
    page?: number;
    pageSize?: number;
    query?: string | null;
    statuses?: string[] | null;
    sort?: string;
  },
): Promise<WarehouseStockPageResult> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
  const query = options?.query?.trim().toLowerCase() ?? '';
  const statuses = options?.statuses?.filter(Boolean) ?? [];
  const sort = options?.sort ?? 'product_asc';

  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('warehouse_id, tenant_product_id, qty_available, qty_reserved, reorder_point, updated_at')
    .eq('warehouse_id', warehouseId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(5000);

  if (error) throw error;

  const baseRows = await loadWarehouseInventoryRows(db, [warehouseId], true, (data ?? []) as Array<Record<string, unknown>>);
  const productIds = Array.from(new Set(baseRows.map((row) => row.tenant_product_id)));
  const latestDemandByProduct = await loadLatestDemandByProduct(db, productIds);
  let items = await hydrateInventoryItems(baseRows, latestDemandByProduct);

  if (query) {
    items = items.filter((item) => {
      const haystack = [item.product_name, item.brand_name, item.sku].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  if (statuses.length > 0) {
    items = items.filter((item) => matchesWarehouseStockStatuses(statuses, item));
  }

  items.sort((a, b) => {
    if (sort === 'on_hand_desc') return b.qty_available - a.qty_available || a.product_name.localeCompare(b.product_name);
    if (sort === 'reserved_desc') return b.qty_reserved - a.qty_reserved || a.product_name.localeCompare(b.product_name);
    if (sort === 'sellable_desc') return b.sellable_units - a.sellable_units || a.product_name.localeCompare(b.product_name);
    if (sort === 'reorder_asc') {
      const aValue = a.reorder_point ?? Number.POSITIVE_INFINITY;
      const bValue = b.reorder_point ?? Number.POSITIVE_INFINITY;
      return aValue - bValue || a.product_name.localeCompare(b.product_name);
    }
    return a.product_name.localeCompare(b.product_name) || a.tenant_product_id.localeCompare(b.tenant_product_id);
  });

  const total = items.length;
  const from = (page - 1) * pageSize;
  const pagedItems = items.slice(from, from + pageSize);

  return {
    items: pagedItems,
    total,
    page,
    page_size: pageSize,
    has_more: from + pagedItems.length < total,
  };
}

export async function loadWarehouseSummary(
  db: any,
  tenantId: string,
  warehouseId: string,
): Promise<WarehouseDetailResponse | null> {
  const warehouses = await loadTenantWarehouses(db, tenantId, { id: warehouseId });
  const warehouse = warehouses[0];
  if (!warehouse) return null;

  const mappedLocationUsers = warehouse.location?.associated_users?.length ? warehouse.location.associated_users : [];

  const warehouseQuarterMeta = getSellerLandingPeriodMeta('quarter');
  const warehouseQuarterStart = warehouseQuarterMeta.current_start.slice(0, 10);
  const [warehouseNowRes, warehousePeriodRes] = await Promise.all([
    db
      .schema('app')
      .from('metrics_warehouse_now_summary')
      .select('available_product_count, in_stock_product_count, sellable_units, low_stock_product_count, out_of_stock_product_count, idle_stock_product_count, idle_stock_units')
      .eq('warehouse_id', warehouseId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle(),
    db
      .schema('app')
      .from('metrics_warehouse_period_summary')
      .select('invoice_value, sold_sku_count, sold_units')
      .eq('warehouse_id', warehouseId)
      .eq('tenant_id', tenantId)
      .eq('grain', 'quarter')
      .eq('period_start', warehouseQuarterStart)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);
  if (warehouseNowRes.error) throw warehouseNowRes.error;
  if (warehousePeriodRes.error) throw warehousePeriodRes.error;

  const warehouseNow = (warehouseNowRes.data ?? null) as {
    available_product_count: number;
    in_stock_product_count: number;
    sellable_units: number;
    low_stock_product_count: number;
    out_of_stock_product_count: number;
    idle_stock_product_count: number;
    idle_stock_units: number;
  } | null;
  const warehouseQuarter = (warehousePeriodRes.data ?? null) as {
    invoice_value: number;
    sold_sku_count: number;
    sold_units: number;
  } | null;

  // v4 metrics_warehouse_now_summary is the sole source now — no v2 RPC fallback. A
  // brand-new warehouse shows zeroed KPIs until the next metrics tick populates its row,
  // same tradeoff every other v4-migrated landing/detail page already accepts.
  const trackedSkus = warehouseNow?.in_stock_product_count ?? 0;
  const sellableUnits = warehouseNow?.sellable_units ?? 0;
  const lowStockSkus = warehouseNow?.low_stock_product_count ?? 0;
  const stockoutSkus = warehouseNow?.out_of_stock_product_count ?? 0;
  const idleStockSkus = warehouseNow?.idle_stock_product_count ?? 0;
  const reorderTriggeredSkus = lowStockSkus + stockoutSkus;

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
    linked_location: warehouse.location
      ? {
          ...warehouse.location,
          associated_users: warehouse.location.associated_users,
        }
      : null,
    address: warehouse.address,
    associated_users: warehouse.associated_users,
    created_at: warehouse.created_at,
    updated_at: warehouse.updated_at,
    tracked_skus_count: trackedSkus,
    meta_strip: {
      sales_qtd_value: warehouseQuarter?.invoice_value ?? 0,
      tracked_skus: trackedSkus,
      sellable_units: sellableUnits,
      low_stock_skus: lowStockSkus,
      out_of_stock_skus: stockoutSkus,
      idle_stock_skus: idleStockSkus,
      idle_stock_units: warehouseNow?.idle_stock_units ?? 0,
    },
    details: {
      associated_users_count: mappedLocationUsers.length > 0 ? mappedLocationUsers.length : warehouse.associated_users.length,
      stockout_skus: stockoutSkus,
      reorder_triggered_skus: reorderTriggeredSkus,
    },
  };
}

export async function loadLatestDemandByProduct(
  db: any,
  tenantProductIds: string[],
) {
  if (tenantProductIds.length === 0) return new Map<string, string>();

  const latest = new Map<string, string>();
  for (const productChunk of chunkArray(tenantProductIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data, error } = await db
      .schema('app')
      .from('order_items')
      .select('tenant_product_id, created_at')
      .in('tenant_product_id', productChunk)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const productId = typeof row.tenant_product_id === 'string' ? row.tenant_product_id : null;
      const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
      if (!productId || !createdAt) continue;

      const existing = latest.get(productId);
      if (!existing || createdAt > existing) {
        latest.set(productId, createdAt);
      }
    }
  }

  return latest;
}
