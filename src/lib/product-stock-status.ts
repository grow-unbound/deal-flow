import type { FilterBarGroup } from '@/components/seller/layout';

/** API query values for `stock` / `status` filters on product inventory tables. */
export const PRODUCT_STOCK_STATUS = {
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  IDLE_STOCK: 'idle_stock',
} as const;

export type ProductStockStatusValue = (typeof PRODUCT_STOCK_STATUS)[keyof typeof PRODUCT_STOCK_STATUS];

export const PRODUCT_STOCK_STATUS_OPTIONS: Array<{ value: ProductStockStatusValue; label: string }> = [
  { value: PRODUCT_STOCK_STATUS.LOW_STOCK, label: 'Low stock' },
  { value: PRODUCT_STOCK_STATUS.OUT_OF_STOCK, label: 'Out of stock' },
  { value: PRODUCT_STOCK_STATUS.IDLE_STOCK, label: 'Idle stock' },
];

export function createProductStockStatusFilterGroup(
  values: string[],
  onChange: (values: string[]) => void,
): FilterBarGroup {
  return {
    key: 'stock',
    label: 'Stock status',
    options: PRODUCT_STOCK_STATUS_OPTIONS,
    values,
    onChange,
  };
}

export function productStockStatusLabel(flags: {
  onHand: number;
  lowStock: boolean;
  outOfStock: boolean;
  isIdle: boolean;
}): { tone: 'danger' | 'warning' | 'neutral' | 'success'; label: string } {
  if (flags.outOfStock || flags.onHand <= 0) {
    return { tone: 'danger', label: 'Out of stock' };
  }
  if (flags.lowStock) {
    return { tone: 'warning', label: 'Low stock' };
  }
  if (flags.isIdle) {
    return { tone: 'neutral', label: 'Idle stock' };
  }
  return { tone: 'success', label: 'On pace' };
}
