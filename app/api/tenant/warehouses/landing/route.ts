import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { SELLER_CACHE_REFERENCE, parseRowsLimit } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodFromRequest } from '@/lib/server/seller-period';
import { computeWarehouseInitials } from '@/lib/server/warehouse-metrics';
import { hydrateWarehouse } from '@/lib/server/warehouse-data';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  WarehousesLandingResponse,
  WarehousesLandingRow,
  WarehouseStockStatus,
} from '@/types/tenant-warehouses';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json(
    { data: null, error: { code: code ?? 'ERROR', message } },
    { status },
  );
}

function overallStockStatus(lowStockSkus: number, stockoutSkus: number): WarehouseStockStatus {
  if (stockoutSkus > 0) return 'out_of_stock';
  if (lowStockSkus > 0) return 'low_stock';
  return 'clear';
}

function matchesStatusFilter(status: string, filters: string[]) {
  return filters.length === 0 || filters.includes('All') || filters.includes(status === 'active' ? 'Active' : 'Inactive');
}

function matchesStockFilter(stockStatus: WarehouseStockStatus, filters: string[]) {
  if (filters.length === 0 || filters.includes('All')) return true;
  return filters.some((value) => {
    if (value === 'In Stock') return stockStatus === 'clear';
    if (value === 'Low Stock') return stockStatus === 'low_stock';
    if (value === 'Out of Stock') return stockStatus === 'out_of_stock';
    return false;
  });
}

interface WarehouseSnapshotRow {
  warehouse_id: string;
  tracked_skus: number;
  sellable_units: number;
  low_stock_skus: number;
  stockout_skus: number;
  idle_stock_skus: number;
  last_inventory_update: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return jsonError(401, 'Login required', 'UNAUTHORIZED');
    }
    if (claims.role !== 'seller_admin') {
      return jsonError(403, 'Forbidden', 'FORBIDDEN');
    }
    if (!supabaseAdmin) {
      return jsonError(500, 'Server configuration error', 'SERVER_ERROR');
    }

    const period = getSellerLandingPeriodFromRequest(request);
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusFilters = request.nextUrl.searchParams.getAll('status');
    const stockFilters = request.nextUrl.searchParams.getAll('stock');
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const db = supabaseAdmin as any;

    const [warehousesRes, snapshotRes] = await Promise.all([
      db
        .schema('app')
        .from('warehouses')
        .select('id, tenant_id, location_id, name, address, phone_number, status, is_default, external_ref, associated_users, lat, lng, deleted_at, created_at, updated_at, locations(id, name, is_default)')
        .eq('tenant_id', claims.tenant_id)
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit),
      db
        .schema('app')
        .from('warehouses_snapshot')
        .select('warehouse_id, tracked_skus, sellable_units, low_stock_skus, stockout_skus, idle_stock_skus, last_inventory_update')
        .eq('tenant_id', claims.tenant_id),
    ]);

    if (warehousesRes.error) throw warehousesRes.error;
    if (snapshotRes.error) throw snapshotRes.error;

    const snapshotByWarehouse = new Map<string, WarehouseSnapshotRow>();
    for (const row of (snapshotRes.data ?? []) as Array<Record<string, unknown>>) {
      snapshotByWarehouse.set(String(row.warehouse_id), {
        warehouse_id: String(row.warehouse_id),
        tracked_skus: Number(row.tracked_skus ?? 0),
        sellable_units: Number(row.sellable_units ?? 0),
        low_stock_skus: Number(row.low_stock_skus ?? 0),
        stockout_skus: Number(row.stockout_skus ?? 0),
        idle_stock_skus: Number(row.idle_stock_skus ?? 0),
        last_inventory_update: typeof row.last_inventory_update === 'string' ? row.last_inventory_update : null,
      });
    }

    const warehouses = ((warehousesRes.data ?? []) as Record<string, unknown>[]).map(hydrateWarehouse);

    const rows: WarehousesLandingRow[] = warehouses.map((warehouse) => {
      const snapshot = snapshotByWarehouse.get(warehouse.id);
      const trackedSkus = snapshot?.tracked_skus ?? 0;
      const sellableUnits = snapshot?.sellable_units ?? 0;
      const lowStockSkus = snapshot?.low_stock_skus ?? 0;
      const stockoutSkus = snapshot?.stockout_skus ?? 0;
      const idleStockSkus = snapshot?.idle_stock_skus ?? 0;
      const lastUpdated = snapshot?.last_inventory_update ?? warehouse.updated_at;

      return {
        id: warehouse.id,
        name: warehouse.name,
        initials: computeWarehouseInitials(warehouse.name),
        city: warehouse.address.city,
        state: warehouse.address.state,
        linked_location_name: warehouse.location?.name ?? null,
        status: warehouse.status,
        is_default: warehouse.is_default,
        tracked_skus: trackedSkus,
        sellable_units: sellableUnits,
        low_stock_skus: lowStockSkus,
        stockout_skus: stockoutSkus,
        idle_stock_skus: idleStockSkus,
        stock_status: overallStockStatus(lowStockSkus, stockoutSkus),
        last_updated: lastUpdated,
        associated_users_count: warehouse.associated_users.length,
      };
    });

    const filteredRows = rows.filter((row) => {
      const matchesSearch =
        !search ||
        row.name.toLowerCase().includes(search) ||
        row.city.toLowerCase().includes(search) ||
        (row.linked_location_name ?? '').toLowerCase().includes(search);
      return matchesSearch && matchesStatusFilter(row.status, statusFilters) && matchesStockFilter(row.stock_status, stockFilters);
    });

    const response: WarehousesLandingResponse = {
      kpis: {
        active_warehouses: rows.filter((row) => row.status === 'active').length,
        tracked_skus: rows.reduce((sum, row) => sum + row.tracked_skus, 0),
        low_stock_warehouses: rows.filter((row) => row.stock_status !== 'clear').length,
        idle_stock_skus: rows.reduce((sum, row) => sum + row.idle_stock_skus, 0),
      },
      callouts: {
        stock_attention: [...rows]
          .sort((a, b) => (b.low_stock_skus + b.stockout_skus) - (a.low_stock_skus + a.stockout_skus))
          .filter((row) => row.low_stock_skus + row.stockout_skus > 0)
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            name: row.name,
            initials: row.initials,
            city: row.city,
            value: row.low_stock_skus + row.stockout_skus,
          })),
        idle_stock: [...rows]
          .sort((a, b) => b.idle_stock_skus - a.idle_stock_skus)
          .filter((row) => row.idle_stock_skus > 0)
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            name: row.name,
            initials: row.initials,
            city: row.city,
            value: row.idle_stock_skus,
          })),
        recently_replenished: [...rows]
          .sort((a, b) => b.last_updated.localeCompare(a.last_updated))
          .slice(0, 3)
          .map((row) => ({
            id: row.id,
            name: row.name,
            initials: row.initials,
            city: row.city,
            value: row.tracked_skus,
            last_updated: row.last_updated,
          })),
      },
      warehouses: filteredRows,
      period,
      refreshed_at: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200, headers: SELLER_CACHE_REFERENCE });
  } catch (error) {
    console.error('[GET /api/tenant/warehouses/landing]', error);
    return jsonError(500, 'Failed to load warehouses landing', 'LOAD_FAILED');
  }
}
