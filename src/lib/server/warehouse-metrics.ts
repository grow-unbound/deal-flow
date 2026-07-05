import type { WarehouseStockStatus } from '@/types/tenant-warehouses';

export const IDLE_STOCK_LOOKBACK_DAYS = 30;

export function computeWarehouseInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'WH';
}

export function computeSellableUnits(qtyAvailable: number, qtyReserved: number) {
  return Math.max(0, qtyAvailable - qtyReserved);
}

export function computeWarehouseStockStatus(
  qtyAvailable: number,
  qtyReserved: number,
  reorderPoint: number | null,
): WarehouseStockStatus {
  const sellable = computeSellableUnits(qtyAvailable, qtyReserved);
  if (sellable <= 0) return 'out_of_stock';
  if (reorderPoint != null && sellable < reorderPoint) return 'low_stock';
  return 'clear';
}

export function isIdleStockSku(sellableUnits: number, lastDemandAt: string | null, now = new Date()) {
  if (sellableUnits <= 0) return false;
  if (!lastDemandAt) return true;

  const demandTs = new Date(lastDemandAt).getTime();
  if (!Number.isFinite(demandTs)) return true;

  const lookbackStart = new Date(now.getTime() - IDLE_STOCK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).getTime();
  return demandTs < lookbackStart;
}

export function stockStatusLabel(status: WarehouseStockStatus) {
  if (status === 'out_of_stock') return 'Out of stock';
  if (status === 'low_stock') return 'Low stock';
  return 'Clear';
}
