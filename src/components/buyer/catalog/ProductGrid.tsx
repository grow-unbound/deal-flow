'use client';

import * as React from 'react';
import { type RefObject } from 'react';
import { ProductCard } from './ProductCard';
import { LoadingSkeleton, ProductCardSkeletonItem } from './LoadingSkeleton';
import { BUYER_PRODUCT_GRID_CLASS } from '@/lib/buyer-ui';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ProductGridProps {
  items: BuyerCatalogItem[];
  loading?: boolean;
  loadingMore?: boolean;
  sentinelIndex?: number;
  sentinelRef?: RefObject<HTMLDivElement | null>;
  showPromotionBadge?: boolean;
  /** Per-item ref registrar for viewport-gated enrichment (e.g. search results). */
  registerItemRef?: (id: string) => (el: HTMLDivElement | null) => void;
}

function mergeRefs(
  a: RefObject<HTMLDivElement | null> | undefined,
  b: ((el: HTMLDivElement | null) => void) | undefined,
): ((el: HTMLDivElement | null) => void) | undefined {
  if (!a && !b) return undefined;
  return (el: HTMLDivElement | null) => {
    if (a) a.current = el;
    if (b) b(el);
  };
}

export function ProductGrid({
  items,
  loading = false,
  loadingMore = false,
  sentinelIndex = -1,
  sentinelRef,
  showPromotionBadge = true,
  registerItemRef,
}: ProductGridProps) {
  if (loading) return <LoadingSkeleton count={6} />;

  if (items.length === 0) return null;

  return (
    <div className={BUYER_PRODUCT_GRID_CLASS}>
      {items.map((item, index) => (
        <div
          key={item.id}
          ref={mergeRefs(index === sentinelIndex ? sentinelRef : undefined, registerItemRef?.(item.id))}
          className="min-w-0"
        >
          <ProductCard item={item} showPromotionBadge={showPromotionBadge} />
        </div>
      ))}
      {loadingMore ? (
        <>
          <ProductCardSkeletonItem />
          <ProductCardSkeletonItem />
        </>
      ) : null}
    </div>
  );
}
