import * as React from 'react';

/** A single skeleton row — render this directly as a list sibling (e.g. appended
 * after real rows while paginating) rather than re-wrapping it in its own
 * container, which would double the list's own padding around just those rows. */
export function TransactionCardSkeletonItem() {
  return (
    <div className="min-h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-28 rounded bg-cream-200" />
          <div className="h-3 w-36 rounded bg-cream-200" />
          <div className="h-2.5 w-24 rounded bg-cream-200" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="h-5 w-16 rounded-full bg-cream-200" />
          <div className="h-4 w-14 rounded bg-cream-200" />
        </div>
      </div>
    </div>
  );
}

export function BuyerTransactionCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {Array.from({ length: count }).map((_, i) => (
        <TransactionCardSkeletonItem key={i} />
      ))}
    </div>
  );
}

/** @deprecated Use BuyerTransactionCardSkeleton */
export const OrderRowSkeleton = BuyerTransactionCardSkeleton;
