import type { CatalogPricingMode } from '@/lib/server/public-catalog';
import type { BuyerCatalogItem } from '@/types/buyer';

export type AssignedPriceMap = Record<string, number | null>;

export function needsAssignedPriceFetch(
  mode: CatalogPricingMode | '',
  priceListId: string,
  assignedByList: Record<string, AssignedPriceMap>,
): boolean {
  return mode === 'assigned_price_list' && Boolean(priceListId) && assignedByList[priceListId] == null;
}

export function assignedPricesFromPreviewItems(items: BuyerCatalogItem[]): AssignedPriceMap {
  const out: AssignedPriceMap = {};
  for (const item of items) {
    out[item.tenant_product_id] = item.price;
  }
  return out;
}

/** Remap guest unit prices without refetching the catalog. Base rates live on `resolved_price`. */
export function applyOnboardingPreviewPrices(
  items: BuyerCatalogItem[],
  mode: CatalogPricingMode | '',
  assignedByProductId: AssignedPriceMap | null,
): BuyerCatalogItem[] {
  if (!mode || mode === 'hidden_until_login') {
    return items;
  }
  if (mode === 'base_selling_rate') {
    return items.map((item) => ({
      ...item,
      price: item.resolved_price ?? item.price,
    }));
  }
  if (!assignedByProductId) {
    return items.map((item) => ({ ...item, price: null }));
  }
  return items.map((item) => ({
    ...item,
    price: assignedByProductId[item.tenant_product_id] ?? null,
  }));
}
