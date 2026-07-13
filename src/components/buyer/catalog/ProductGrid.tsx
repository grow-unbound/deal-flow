'use client';

import * as React from 'react';
import { Fragment, type RefObject } from 'react';
import { ProductCard } from './ProductCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import type { BuyerCatalogItem } from '@/types/buyer';

interface ProductGridProps {
  items: BuyerCatalogItem[];
  loading?: boolean;
  loadingMore?: boolean;
  sentinelIndex?: number;
  sentinelRef?: RefObject<HTMLDivElement>;
}

export function ProductGrid({
  items,
  loading = false,
  loadingMore = false,
  sentinelIndex = -1,
  sentinelRef,
}: ProductGridProps) {
  if (loading) return <LoadingSkeleton count={6} />;

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 px-2 pb-3">
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <ProductCard item={item} />
          {index === sentinelIndex && sentinelRef ? (
            <div ref={sentinelRef} className="col-span-2 h-px" aria-hidden />
          ) : null}
        </Fragment>
      ))}
      {loadingMore ? <LoadingSkeleton count={2} /> : null}
    </div>
  );
}
