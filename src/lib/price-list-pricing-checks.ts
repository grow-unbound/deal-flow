import type { PriceListDetail } from '@/hooks/usePriceLists';

export interface DiscountBandCounts {
  discounted: number;
  atBase: number;
  aboveBase: number;
  total: number;
}

/**
 * Computes discounted / at-base / above-base counts from priceList.items against
 * each item's base_selling_price.
 */
export function getDiscountBandCounts(priceList: PriceListDetail): DiscountBandCounts {
  let discounted = 0;
  let atBase = 0;
  let aboveBase = 0;
  for (const item of priceList.items) {
    const base = item.tenant_product?.base_selling_price ?? null;
    if (base == null) continue;
    if (item.price < base) discounted += 1;
    else if (Math.abs(item.price - base) < 0.0001) atBase += 1;
    else aboveBase += 1;
  }
  return { discounted, atBase, aboveBase, total: discounted + atBase + aboveBase };
}
