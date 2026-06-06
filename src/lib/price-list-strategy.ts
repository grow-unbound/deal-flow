import type { PriceListPricingStrategy } from '@/lib/zod';

export interface PriceListStrategyProductLike {
  base_selling_price: number | null;
  mrp: number | null;
}

/**
 * Computes default list price from strategy (before row overrides).
 * `margin_from_mrp` is a legacy DB key: discount is applied off base selling price.
 */
export function computeStrategyPrice(
  product: PriceListStrategyProductLike,
  strategy: PriceListPricingStrategy,
  strategyValue: string,
): number {
  const base = Number(product.base_selling_price ?? 0);
  if (strategy === 'margin_from_mrp') {
    const discount = Number(strategyValue || 0);
    return Math.max(0, Math.round(base * (1 - discount / 100)));
  }
  if (strategy === 'flat_off_base') {
    const amount = Number(strategyValue || 0);
    return Math.max(0, Math.round(base - amount));
  }
  return Math.max(0, Math.round(base));
}

export function formatStrategySummary(
  strategy: PriceListPricingStrategy | undefined | null,
  strategyValue: number | null | undefined,
): string {
  const s = strategy ?? 'edit_each';
  if (s === 'edit_each') return 'Independent product pricing';
  if (s === 'margin_from_mrp') {
    const v = strategyValue ?? 0;
    return `${v}% off base price`;
  }
  const flat = Number(strategyValue ?? 0);
  return `Flat ₹${flat.toLocaleString('en-IN')} off base price`;
}

export function strategyLabelShort(value: PriceListPricingStrategy): string {
  if (value === 'margin_from_mrp') return '% off base price';
  if (value === 'flat_off_base') return 'Flat ₹ off base price';
  return 'Edit each price';
}

/** Center-panel secondary line when bulk rule applies */
export function formatApplyingRuleSummary(
  strategy: PriceListPricingStrategy,
  strategyValue: string,
  selectedCount: number,
  overrideCount: number,
): string {
  const overridePart =
    overrideCount === 0
      ? 'No row overrides yet.'
      : `${overrideCount} row override${overrideCount === 1 ? '' : 's'}.`;

  if (strategy === 'margin_from_mrp') {
    const pct = strategyValue || '0';
    return `Applying ${pct}% off base price to ${selectedCount} selected products · ${overridePart}`;
  }
  if (strategy === 'flat_off_base') {
    const amt = Number(strategyValue || 0).toLocaleString('en-IN');
    return `Applying flat ₹${amt} off base price to ${selectedCount} selected products · ${overridePart}`;
  }
  return overridePart;
}
