import { PRODUCT_STOCK_STATUS, type ProductStockStatusValue } from '@/lib/product-stock-status';

export interface ProductStockFilterFlags {
  onHand: number;
  lowStock: boolean;
  outOfStock: boolean;
  isIdle: boolean;
}

export function parseProductStockStatusParams(searchParams: URLSearchParams): ProductStockStatusValue[] {
  return searchParams.getAll('stock').filter(Boolean) as ProductStockStatusValue[];
}

/** Warehouse stock route uses `status` — same enum values as product `stock`. */
export function parseWarehouseStockStatusParams(searchParams: URLSearchParams): ProductStockStatusValue[] {
  return searchParams.getAll('status').filter(Boolean) as ProductStockStatusValue[];
}

export function matchesProductStockStatuses(
  statuses: string[] | null | undefined,
  flags: ProductStockFilterFlags,
): boolean {
  if (!statuses || statuses.length === 0) return true;

  return statuses.some((status) => {
    if (status === PRODUCT_STOCK_STATUS.LOW_STOCK) return flags.lowStock && flags.onHand > 0;
    if (status === PRODUCT_STOCK_STATUS.OUT_OF_STOCK) return flags.outOfStock || flags.onHand <= 0;
    if (status === PRODUCT_STOCK_STATUS.IDLE_STOCK) return flags.isIdle;
    return false;
  });
}

export function matchesWarehouseStockStatuses(
  statuses: string[] | null | undefined,
  item: { stock_status: string; is_idle: boolean },
): boolean {
  if (!statuses || statuses.length === 0) return true;

  return statuses.some((status) => {
    if (status === PRODUCT_STOCK_STATUS.IDLE_STOCK) return item.is_idle;
    if (status === PRODUCT_STOCK_STATUS.LOW_STOCK) return item.stock_status === 'low_stock';
    if (status === PRODUCT_STOCK_STATUS.OUT_OF_STOCK) return item.stock_status === 'out_of_stock';
    return false;
  });
}
