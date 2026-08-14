import * as React from 'react';
import { BUYER_CARD_RADIUS_CLASS, BUYER_PRODUCT_GRID_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

/** A single skeleton card — sized to match a real ProductCard exactly. Render this
 * directly as a grid sibling (never re-wrapped in its own grid container), or the
 * nested grid squeezes it into one outer cell and it renders as a thin sliver. */
export function ProductCardSkeletonItem() {
  return (
    <div
      className={cn(
        BUYER_CARD_RADIUS_CLASS,
        'flex flex-col overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] animate-pulse',
      )}
    >
      <div className="relative aspect-square bg-[var(--bg-recessed)]">
        <div className="absolute right-2 bottom-2 h-8 w-8 rounded-md bg-[var(--cream-300)]" />
      </div>
      <div className="flex flex-col gap-1.5 bg-[var(--cream-50)] p-2.5">
        {/* Reserves the same 2-line title height ProductCard's BUYER_TWO_LINE_TITLE_CLASS
            does, plus the SKU line below it, so real content swapping in doesn't shift
            the price row down. */}
        <div className={cn('flex flex-col gap-1', BUYER_TWO_LINE_TITLE_CLASS)}>
          <div className="h-2.5 w-4/5 rounded-full bg-[var(--bg-recessed)]" />
          <div className="h-2.5 w-3/5 rounded-full bg-[var(--bg-recessed)]" />
        </div>
        <div className="h-2 w-2/5 rounded-full bg-[var(--bg-recessed)]" />
        <div className="mt-0.5 h-4 w-2/5 rounded-full bg-[var(--bg-recessed)]" />
      </div>
    </div>
  );
}

interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 6 }: LoadingSkeletonProps) {
  return (
    <div className={BUYER_PRODUCT_GRID_CLASS}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeletonItem key={i} />
      ))}
    </div>
  );
}
