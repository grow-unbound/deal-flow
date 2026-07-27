import type { BuyerCartItem } from '@/contexts/BuyerCartContext';
import type { CartBundle } from '@/types/buyer-reco';
import type { BuyerCatalogItem } from '@/types/buyer';

export interface RankedBundle {
  bundle: CartBundle;
  covered: number;
  requiredCount: number;
  missingCount: number;
  completionRatio: number;
  apiOrder: number;
}

export interface CartGapRecommendation {
  product: BuyerCatalogItem;
  bundleId: string;
  bundleName: string;
  tenantCategoryId: string;
  slotLabel: string | null;
}

export function getCoveredCategoryIds(items: BuyerCartItem[]): Set<string> {
  return new Set(items.map((i) => i.tenant_category_id).filter(Boolean) as string[]);
}

const MAX_PRODUCTS_PER_MISSING_CATEGORY = 1;

function isSlotCovered(
  slot: CartBundle['slots'][number],
  coveredCategoryIds: Set<string>,
  cartProductIds: Set<string>,
): boolean {
  if (coveredCategoryIds.has(slot.tenant_category_id)) return true;
  return slot.top_products.some((p) => cartProductIds.has(p.tenant_product_id));
}

export function getCartProductIds(items: BuyerCartItem[]): Set<string> {
  return new Set(items.map((i) => i.tenant_product_id));
}

function scoreBundle(bundle: CartBundle, coveredCategoryIds: Set<string>, apiOrder: number): RankedBundle | null {
  const requiredSlots = bundle.slots.filter((s) => s.is_required);
  if (requiredSlots.length === 0) return null;

  const covered = requiredSlots.filter((s) => coveredCategoryIds.has(s.tenant_category_id)).length;
  if (covered < 1) return null;

  const missingCount = requiredSlots.length - covered;
  const completionRatio = covered / requiredSlots.length;

  return {
    bundle,
    covered,
    requiredCount: requiredSlots.length,
    missingCount,
    completionRatio,
    apiOrder,
  };
}

export function rankQualifyingBundles(bundles: CartBundle[], coveredCategoryIds: Set<string>): RankedBundle[] {
  const ranked: RankedBundle[] = [];

  bundles.forEach((bundle, apiOrder) => {
    const scored = scoreBundle(bundle, coveredCategoryIds, apiOrder);
    if (scored) ranked.push(scored);
  });

  ranked.sort((a, b) => {
    if (b.completionRatio !== a.completionRatio) return b.completionRatio - a.completionRatio;
    if (b.covered !== a.covered) return b.covered - a.covered;
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    return a.apiOrder - b.apiOrder;
  });

  return ranked;
}

export function buildCartGapRecommendations(
  bundles: CartBundle[],
  items: BuyerCartItem[],
): CartGapRecommendation[] {
  if (bundles.length === 0 || items.length === 0) return [];

  const coveredCategoryIds = getCoveredCategoryIds(items);
  const cartProductIds = getCartProductIds(items);
  const ranked = rankQualifyingBundles(bundles, coveredCategoryIds);
  if (ranked.length === 0) return [];

  const seenCategories = new Set<string>();
  const seenProducts = new Set<string>();
  const recommendations: CartGapRecommendation[] = [];

  for (const { bundle } of ranked) {
    const missingRequired = bundle.slots
      .filter((s) => s.is_required && !isSlotCovered(s, coveredCategoryIds, cartProductIds))
      .sort((a, b) => a.display_order - b.display_order);

    for (const slot of missingRequired) {
      if (seenCategories.has(slot.tenant_category_id)) continue;
      if (slot.top_products.length === 0) continue;

      let addedForCategory = 0;
      for (const product of slot.top_products) {
        if (addedForCategory >= MAX_PRODUCTS_PER_MISSING_CATEGORY) break;
        if (cartProductIds.has(product.tenant_product_id)) continue;
        if (seenProducts.has(product.tenant_product_id)) continue;

        seenProducts.add(product.tenant_product_id);
        addedForCategory += 1;
        recommendations.push({
          product,
          bundleId: bundle.id,
          bundleName: bundle.name,
          tenantCategoryId: slot.tenant_category_id,
          slotLabel: slot.slot_label,
        });
      }

      if (addedForCategory > 0) {
        seenCategories.add(slot.tenant_category_id);
      }
    }
  }

  return recommendations;
}
