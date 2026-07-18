import type { DetailCardPayload } from '@/components/seller/detail';
import type { PriceListDetail } from '@/hooks/usePriceLists';

export interface DiscountBandCounts {
  discounted: number;
  atBase: number;
  aboveBase: number;
  total: number;
}

/**
 * Reads the discounted / at-base / above-base counts from the ready
 * `discount-bands-and-price-checks` performance card (app.get_seller_pricelist_detail_v2)
 * so Detail Pulse tiles and the Performance tab derive from the same SQL-computed,
 * base_selling_price-basis source of truth (spec: metrics-product-strategy-proposal-2026-07.md line 652).
 * Falls back to a local recompute from priceList.items only if the card is missing/unavailable.
 */
export function getDiscountBandCounts(priceList: PriceListDetail): DiscountBandCounts {
  const cards = (priceList.performance_cards ?? []) as DetailCardPayload[];
  const bandsCard = cards.find((card) => card.id === 'discount-bands-and-price-checks');

  if (bandsCard && bandsCard.representation !== 'unavailable' && bandsCard.availability !== 'unavailable') {
    const body = bandsCard.body as { items?: Array<{ id: string; value: number | string }> };
    const byId = new Map((body.items ?? []).map((item) => [item.id, Number(item.value ?? 0)]));
    const discounted = byId.get('discounted') ?? 0;
    const atBase = byId.get('at-base') ?? 0;
    const aboveBase = byId.get('above-base') ?? 0;
    return { discounted, atBase, aboveBase, total: discounted + atBase + aboveBase };
  }

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
