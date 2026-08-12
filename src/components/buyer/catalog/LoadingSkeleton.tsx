import * as React from 'react';
import { BUYER_CARD_RADIUS_CLASS, BUYER_PRODUCT_GRID_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 6 }: LoadingSkeletonProps) {
  return (
    <div className={BUYER_PRODUCT_GRID_CLASS}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            BUYER_CARD_RADIUS_CLASS,
            'flex flex-col overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] animate-pulse shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)]',
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
      ))}
    </div>
  );
}
