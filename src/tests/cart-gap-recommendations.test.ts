import { describe, expect, it } from 'vitest';

import type { BuyerCartItem } from '@/contexts/BuyerCartContext';
import {
  buildCartGapRecommendations,
  rankQualifyingBundles,
} from '@/lib/cart-gap-recommendations';
import type { CartBundle } from '@/types/buyer-reco';
import type { BuyerCatalogItem } from '@/types/buyer';

function product(id: string, categoryId: string | null = null): BuyerCatalogItem {
  return {
    id,
    tenant_product_id: id,
    campaign_id: null,
    campaign_name: null,
    campaign_valid_until: null,
    internal_sku: `SKU-${id}`,
    display_name: `Product ${id}`,
    brand_id: null,
    brand_name: null,
    category_id: categoryId,
    category_name: null,
    mrp: 100,
    price: 90,
    default_uom: 'pcs',
    pack_size: 1,
    image_urls: [],
    stock_status: 'available',
    on_hand: 10,
  };
}

function slot(
  categoryId: string,
  topProducts: BuyerCatalogItem[],
  displayOrder: number,
  isRequired = true,
): CartBundle['slots'][number] {
  return {
    tenant_category_id: categoryId,
    slot_label: `Slot ${categoryId}`,
    is_required: isRequired,
    display_order: displayOrder,
    top_products: topProducts,
  };
}

function bundle(id: string, name: string, slots: CartBundle['slots']): CartBundle {
  return { id, name, slots };
}

function cartLine(categoryId: string, productId = `in-cart-${categoryId}`): BuyerCartItem {
  return {
    tenant_product_id: productId,
    name: 'In cart',
    unit_price: 10,
    quantity: 1,
    line_total: 10,
    tenant_category_id: categoryId,
    stock_status: 'available',
  };
}

describe('rankQualifyingBundles', () => {
  it('orders bundles by completion ratio (closest to complete first)', () => {
    const bundles: CartBundle[] = [
      bundle('b-low', 'Low', [
        slot('cat-a', [product('p1', 'cat-a')], 0),
        slot('cat-b', [product('p2', 'cat-b')], 1),
        slot('cat-c', [product('p3', 'cat-c')], 2),
      ]),
      bundle('b-high', 'High', [
        slot('cat-a', [product('p4', 'cat-a')], 0),
        slot('cat-d', [product('p5', 'cat-d')], 1),
      ]),
    ];

    const covered = new Set(['cat-a']);
    const ranked = rankQualifyingBundles(bundles, covered);

    expect(ranked.map((r) => r.bundle.id)).toEqual(['b-high', 'b-low']);
    expect(ranked[0]?.completionRatio).toBe(0.5);
    expect(ranked[1]?.completionRatio).toBeCloseTo(1 / 3);
  });

  it('excludes bundles with no required slot covered', () => {
    const bundles: CartBundle[] = [
      bundle('b1', 'B1', [slot('cat-x', [product('p1', 'cat-x')], 0)]),
    ];
    const ranked = rankQualifyingBundles(bundles, new Set(['cat-other']));
    expect(ranked).toHaveLength(0);
  });
});

describe('buildCartGapRecommendations', () => {
  it('merges missing categories from multiple bundles in rank order', () => {
    const bundles: CartBundle[] = [
      bundle('b1', 'Kit A', [
        slot('cat-a', [product('a1', 'cat-a')], 0),
        slot('cat-b', [product('b1', 'cat-b'), product('b2', 'cat-b')], 1),
      ]),
      bundle('b2', 'Kit B', [
        slot('cat-a', [product('a2', 'cat-a')], 0),
        slot('cat-c', [product('c1', 'cat-c')], 1),
      ]),
    ];
    const items: BuyerCartItem[] = [cartLine('cat-a')];

    const recs = buildCartGapRecommendations(bundles, items);

    expect(recs.map((r) => r.product.tenant_product_id)).toEqual(['b1', 'c1']);
    expect(recs[0]?.bundleName).toBe('Kit A');
    expect(recs[1]?.bundleName).toBe('Kit B');
  });

  it('dedupes categories across bundles (first ranked bundle wins)', () => {
    const bundles: CartBundle[] = [
      bundle('b1', 'First', [
        slot('cat-a', [product('p1', 'cat-a')], 0),
        slot('cat-b', [product('p2', 'cat-b')], 1),
      ]),
      bundle('b2', 'Second', [
        slot('cat-a', [product('p3', 'cat-a')], 0),
        slot('cat-c', [product('p4', 'cat-c')], 1),
      ]),
    ];
    const items: BuyerCartItem[] = [cartLine('cat-a'), cartLine('cat-b')];

    const recs = buildCartGapRecommendations(bundles, items);

    expect(recs.map((r) => r.tenantCategoryId)).toEqual(['cat-c']);
    expect(recs[0]?.product.tenant_product_id).toBe('p4');
  });

  it('skips products already in cart and shows one product per missing category', () => {
    const bundles: CartBundle[] = [
      bundle('b1', 'Kit', [
        slot('cat-a', [product('a1', 'cat-a')], 0),
        slot(
          'cat-m',
          [product('m1', 'cat-m'), product('m2', 'cat-m')],
          1,
        ),
      ]),
    ];
    const items: BuyerCartItem[] = [
      cartLine('cat-a'),
      {
        ...cartLine('cat-z', 'other-product'),
        tenant_category_id: undefined,
      },
    ];

    const recs = buildCartGapRecommendations(bundles, items);

    expect(recs.map((r) => r.product.tenant_product_id)).toEqual(['m1']);
  });

  it('treats slot as covered when recommended product is in cart even without category on line', () => {
    const bundles: CartBundle[] = [
      bundle('b1', 'Kit', [
        slot('cat-a', [product('a1', 'cat-a')], 0),
        slot('cat-b', [product('b1', 'cat-b')], 1),
      ]),
    ];
    const items: BuyerCartItem[] = [
      cartLine('cat-a'),
      {
        ...cartLine('cat-z', 'b1'),
        tenant_category_id: undefined,
      },
    ];

    const recs = buildCartGapRecommendations(bundles, items);

    expect(recs).toHaveLength(0);
  });

  it('returns empty when no bundle is relevant or no products to show', () => {
    expect(buildCartGapRecommendations([], [cartLine('cat-a')])).toEqual([]);
    expect(
      buildCartGapRecommendations(
        [bundle('b', 'B', [slot('cat-a', [], 0)])],
        [cartLine('cat-z')],
      ),
    ).toEqual([]);
    expect(
      buildCartGapRecommendations(
        [bundle('b', 'B', [slot('cat-a', [product('p1', 'cat-a')], 0)])],
        [cartLine('cat-a', 'p1')],
      ),
    ).toEqual([]);
  });
});
