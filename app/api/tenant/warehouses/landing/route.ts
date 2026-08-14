import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import type { WarehouseAddress, WarehouseAssociatedUser } from '@/types/tenant-warehouses';

export const dynamic = 'force-dynamic';

type WarehouseSort = 'invoice_value_desc' | 'sold_units_desc' | 'sold_sku_count_desc' | 'sellable_units_desc' | 'name_asc';
type WarehouseCursor = { v: number | string; i: string };
type WarehousePreset = {
  sold_period?: string;
  not_sold_period?: string;
  stock?: 'out' | 'low' | 'available' | 'sellable' | string;
  stock_gt?: number;
  stock_lte?: number;
  sort?: string;
};
type WarehouseRow = {
  id: string;
  tenant_id: string;
  location_id: string | null;
  name: string;
  address: WarehouseAddress | null;
  phone_number: string | null;
  status: 'active' | 'inactive';
  is_default: boolean | null;
  external_ref: string | null;
  associated_users: WarehouseAssociatedUser[] | null;
  created_at: string;
  updated_at: string;
};
type WarehouseMetricRow = {
  warehouse_id: string;
  sold_sku_count: number | string | null;
  sold_units: number | string | null;
  invoice_value: number | string | null;
};

const WAREHOUSE_SCAN_LIMIT = 1000;
const WAREHOUSE_FILTERS = {
  groups: [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'dormant', label: 'Dormant' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
    {
      key: 'stock',
      label: 'Stock',
      options: [
        { value: 'in_stock', label: 'In Stock' },
        { value: 'low_stock', label: 'Low Stock' },
        { value: 'out_of_stock', label: 'Out of Stock' },
      ],
    },
  ],
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getQuarterPeriod(asOf = new Date()) {
  const month = asOf.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), quarterStartMonth, 1));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), quarterStartMonth + 3, 1));
  return {
    period_key: 'this_quarter',
    grain: 'quarter' as const,
    period_start: start.toISOString().slice(0, 10),
    period_end_exclusive: end.toISOString().slice(0, 10),
    label: 'This Quarter',
  };
}

function parseSort(raw: string | null | undefined): WarehouseSort {
  if (raw === 'sold_units_desc' || raw === 'sold_sku_count_desc' || raw === 'sellable_units_desc' || raw === 'name_asc') return raw;
  return 'invoice_value_desc';
}

function parsePreset(raw: string | null): WarehousePreset | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as WarehousePreset;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStatusFilter(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'active' || normalized === 'dormant' || normalized === 'inactive') return normalized;
  return null;
}

function normalizeStockFilter(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'in_stock' || normalized === 'low_stock' || normalized === 'out_of_stock') return normalized;
  return null;
}

function decodeCursor(raw: string | null): WarehouseCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<WarehouseCursor>;
    if ((typeof parsed.v !== 'number' && typeof parsed.v !== 'string') || typeof parsed.i !== 'string') return null;
    return { v: parsed.v, i: parsed.i };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: WarehouseCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function sortValue(row: Record<string, unknown>, sort: WarehouseSort): number | string {
  if (sort === 'name_asc') return String(row.name ?? '');
  if (sort === 'sold_units_desc') return toNumber(row.sold_units as number);
  if (sort === 'sold_sku_count_desc') return toNumber(row.sold_sku_count as number);
  if (sort === 'sellable_units_desc') return toNumber(row.sellable_units as number);
  return toNumber(row.invoice_value as number);
}

function compareRows(a: Record<string, unknown>, b: Record<string, unknown>, sort: WarehouseSort): number {
  const av = sortValue(a, sort);
  const bv = sortValue(b, sort);
  if (sort === 'name_asc') {
    const compared = String(av).localeCompare(String(bv));
    return compared || String(a.id).localeCompare(String(b.id));
  }
  if (av !== bv) return Number(bv) - Number(av);
  return String(a.id).localeCompare(String(b.id));
}

function passesCursor(row: Record<string, unknown>, sort: WarehouseSort, cursor: WarehouseCursor | null): boolean {
  if (!cursor) return true;
  const value = sortValue(row, sort);
  if (sort === 'name_asc') {
    return String(value).localeCompare(String(cursor.v)) > 0 || (value === cursor.v && String(row.id) > cursor.i);
  }
  return Number(value) < Number(cursor.v) || (Number(value) === Number(cursor.v) && String(row.id) > cursor.i);
}

async function fetchWarehouses(db: any, tenantId: string): Promise<WarehouseRow[]> {
  const { data, error } = await db
    .schema('app')
    .from('warehouses')
    .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(WAREHOUSE_SCAN_LIMIT);
  if (error) throw error;
  return (data ?? []) as WarehouseRow[];
}

async function fetchLocationNames(db: any, locationIds: string[]) {
  const map = new Map<string, string>();
  if (locationIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('locations')
    .select('id, name')
    .in('id', locationIds)
    .is('deleted_at', null)
    .limit(locationIds.length);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) map.set(row.id, row.name);
  return map;
}

async function fetchWarehouseMetrics(db: any, tenantId: string, warehouseIds: string[], period: ReturnType<typeof getQuarterPeriod>) {
  const map = new Map<string, WarehouseMetricRow>();
  if (warehouseIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_warehouse_period_summary')
    .select('warehouse_id, sold_sku_count, sold_units, invoice_value')
    .eq('tenant_id', tenantId)
    .eq('grain', period.grain)
    .eq('period_start', period.period_start)
    .is('deleted_at', null)
    .in('warehouse_id', warehouseIds)
    .limit(warehouseIds.length);
  if (error) throw error;
  for (const row of (data ?? []) as WarehouseMetricRow[]) map.set(row.warehouse_id, row);
  return map;
}

async function fetchInventoryByWarehouse(db: any, warehouseIds: string[]) {
  const map = new Map<string, { trackedSkus: Set<string>; sellableUnits: number; lowStockSkus: number; stockoutSkus: number }>();
  if (warehouseIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('warehouse_id, tenant_product_id, qty_available, reorder_point')
    .in('warehouse_id', warehouseIds)
    .is('deleted_at', null)
    .limit(10000);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ warehouse_id: string; tenant_product_id: string; qty_available: number | string | null; reorder_point: number | string | null }>) {
    const current = map.get(row.warehouse_id) ?? { trackedSkus: new Set<string>(), sellableUnits: 0, lowStockSkus: 0, stockoutSkus: 0 };
    const available = toNumber(row.qty_available);
    const reorderPoint = row.reorder_point == null ? null : toNumber(row.reorder_point);
    current.trackedSkus.add(row.tenant_product_id);
    current.sellableUnits += available;
    if (available <= 0) current.stockoutSkus += 1;
    if (available > 0 && reorderPoint != null && available <= reorderPoint) current.lowStockSkus += 1;
    map.set(row.warehouse_id, current);
  }
  return map;
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'warehouses_landing', init, APP_GET_CACHE_CONTROL);

  try {
    const claims = await getVerifiedClaims(request);
    const adminCheck = assertSellerAdmin(claims);
    if (!adminCheck.ok) {
      return timedJson({ error: adminCheck.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: adminCheck.status });
    }
    if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id!;
    const period = getQuarterPeriod();
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusFilters = request.nextUrl.searchParams.getAll('status');
    const stockFilters = request.nextUrl.searchParams.getAll('stock');
    const preset = parsePreset(request.nextUrl.searchParams.get('filter_preset'));
    const sort = parseSort(preset?.sort ?? request.nextUrl.searchParams.get('sort'));
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursor = decodeCursor(request.nextUrl.searchParams.get('cursor'));

    const selectedStatus = new Set<string>();
    statusFilters.forEach((value) => {
      const normalized = normalizeStatusFilter(value);
      if (normalized) selectedStatus.add(normalized);
    });
    if (preset?.sold_period) selectedStatus.add('active');
    if (preset?.not_sold_period) selectedStatus.add('dormant');
    const selectedStock = new Set<string>();
    stockFilters.forEach((value) => {
      const normalized = normalizeStockFilter(value);
      if (normalized) selectedStock.add(normalized);
    });
    if (preset?.stock === 'out') selectedStock.add('out_of_stock');
    if (preset?.stock === 'low' || typeof preset?.stock_lte === 'number') selectedStock.add('low_stock');
    if (preset?.stock === 'sellable' || preset?.stock === 'available' || typeof preset?.stock_gt === 'number') selectedStock.add('in_stock');

    const warehouses = await fetchWarehouses(db, tenantId);
    const warehouseIds = warehouses.map((row) => row.id);
    const locationIds = [...new Set(warehouses.map((row) => row.location_id).filter((id): id is string => Boolean(id)))];
    const [locationNames, metricsByWarehouse, stockByWarehouse, searchCandidateIds] = await Promise.all([
      fetchLocationNames(db, locationIds),
      fetchWarehouseMetrics(db, tenantId, warehouseIds, period),
      fetchInventoryByWarehouse(db, warehouseIds),
      search
        ? db.schema('app').rpc('search_seller_warehouse_landing_ids_v2', {
            p_tenant_id: tenantId,
            p_query: search,
            p_statuses: null,
            p_stock_modes: null,
            p_location_ids: null,
            p_limit: WAREHOUSE_SCAN_LIMIT,
            p_offset: 0,
          }).then(({ data, error }: { data: Array<{ id: string }> | null; error: unknown }) => {
            if (error) throw error;
            return new Set((data ?? []).map((row) => row.id));
          })
        : Promise.resolve(null as Set<string> | null),
    ]);

    const rows = warehouses.map((warehouse) => {
      const metric = metricsByWarehouse.get(warehouse.id);
      const stock = stockByWarehouse.get(warehouse.id);
      const lowStockSkus = stock?.lowStockSkus ?? 0;
      const stockoutSkus = stock?.stockoutSkus ?? 0;
      const sellableUnits = stock?.sellableUnits ?? 0;
      const trackedSkus = stock?.trackedSkus.size ?? 0;
      return {
        id: warehouse.id,
        name: warehouse.name,
        initials: initials(warehouse.name),
        city: warehouse.address?.city ?? '',
        state: warehouse.address?.state ?? '',
        linked_location_name: warehouse.location_id ? locationNames.get(warehouse.location_id) ?? null : null,
        status: warehouse.status,
        is_default: Boolean(warehouse.is_default),
        tracked_skus: trackedSkus,
        sellable_units: sellableUnits,
        low_stock_skus: lowStockSkus,
        stockout_skus: stockoutSkus,
        idle_stock_skus: 0,
        stock_status: stockoutSkus > 0 ? 'out_of_stock' : lowStockSkus > 0 ? 'low_stock' : 'clear',
        last_updated: warehouse.updated_at,
        associated_users_count: Array.isArray(warehouse.associated_users) ? warehouse.associated_users.length : 0,
        sold_sku_count: toNumber(metric?.sold_sku_count),
        sold_units: toNumber(metric?.sold_units),
        invoice_value: toNumber(metric?.invoice_value),
      };
    });

    const filtered = rows
      .filter((row) => {
        const sold = row.sold_sku_count > 0 || row.sold_units > 0 || row.invoice_value > 0;
        if (selectedStatus.size > 0) {
          const statusOk = [...selectedStatus].some((status) => {
            if (status === 'active') return row.status === 'active' && sold;
            if (status === 'dormant') return row.status === 'active' && !sold;
            if (status === 'inactive') return row.status === 'inactive';
            return false;
          });
          if (!statusOk) return false;
        }
        if (selectedStock.size > 0) {
          const stockOk = [...selectedStock].some((stock) => {
            if (stock === 'out_of_stock') return row.tracked_skus > 0 && row.sellable_units <= 0;
            if (stock === 'low_stock') return row.low_stock_skus > 0;
            if (stock === 'in_stock') return row.sellable_units > 0 && row.low_stock_skus === 0;
            return false;
          });
          if (!stockOk) return false;
        }
        // Indexed (idx_warehouses_search_vector) name/phone/status match, plus a
        // fallback substring check on the joined location name (not part of
        // the warehouse's own search_vector).
        return !search || (searchCandidateIds?.has(row.id) ?? false) || row.linked_location_name?.toLowerCase().includes(search);
      })
      .sort((a, b) => compareRows(a, b, sort));

    const afterCursor = filtered.filter((row) => passesCursor(row, sort, cursor));
    const pageRows = afterCursor.slice(0, limit);
    const hasNext = afterCursor.length > limit;
    const last = pageRows.at(-1);

    return timedJson({
      warehouses: pageRows,
      total: filtered.length,
      limit,
      nextCursor: hasNext && last ? encodeCursor({ v: sortValue(last, sort), i: last.id }) : null,
      period,
      period_key: period.period_key,
      grain: period.grain,
      sort,
      refreshed_at: new Date().toISOString(),
      filters: WAREHOUSE_FILTERS,
    });
  } catch (error) {
    console.error('[GET /api/tenant/warehouses/landing]', error);
    return timedJson({ error: 'Failed to load warehouses landing' }, { status: 500 });
  }
}
