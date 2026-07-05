import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { SELLER_CACHE_REFERENCE, parseRowsLimit } from '@/lib/server/bounded-get';
import { loadLatestDemandByProduct, loadTenantWarehouses, loadWarehouseInventoryRows } from '@/lib/server/warehouse-data';
import { getSellerLandingPeriodFromRequest } from '@/lib/server/seller-period';
import {
  computeSellableUnits,
  computeWarehouseInitials,
  computeWarehouseStockStatus,
  isIdleStockSku,
} from '@/lib/server/warehouse-metrics';
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

    const warehouses = await loadTenantWarehouses(db, claims.tenant_id, { limit });
    const warehouseIds = warehouses.map((warehouse) => warehouse.id);
    const inventoryRows = await loadWarehouseInventoryRows(db, warehouseIds);
    const latestDemandByProduct = await loadLatestDemandByProduct(
      db,
      Array.from(new Set(inventoryRows.map((row) => row.tenant_product_id))),
    );

    const inventoryByWarehouse = new Map<string, typeof inventoryRows>();
    for (const row of inventoryRows) {
      const current = inventoryByWarehouse.get(row.warehouse_id) ?? [];
      current.push(row);
      inventoryByWarehouse.set(row.warehouse_id, current);
    }

    const rows: WarehousesLandingRow[] = warehouses.map((warehouse) => {
      const items = inventoryByWarehouse.get(warehouse.id) ?? [];
      let trackedSkus = 0;
      let sellableUnits = 0;
      let lowStockSkus = 0;
      let stockoutSkus = 0;
      let idleStockSkus = 0;
      let lastUpdated = warehouse.updated_at;

      for (const item of items) {
        trackedSkus += 1;
        const sellable = computeSellableUnits(item.qty_available, item.qty_reserved);
        const status = computeWarehouseStockStatus(item.qty_available, item.qty_reserved, item.reorder_point);
        sellableUnits += sellable;
        if (status === 'out_of_stock') stockoutSkus += 1;
        else if (status === 'low_stock') lowStockSkus += 1;

        const lastDemandAt = latestDemandByProduct.get(item.tenant_product_id) ?? null;
        if (isIdleStockSku(sellable, lastDemandAt)) idleStockSkus += 1;
        if (item.updated_at > lastUpdated) lastUpdated = item.updated_at;
      }

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
