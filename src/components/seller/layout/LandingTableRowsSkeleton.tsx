'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { SellerMobileListSkeleton } from '@/components/seller/mobile';
import type { SellerSplitListVariant } from '@/lib/seller-split-list-ui';

export function LandingTableRowsSkeleton({
  columns,
  rows = 14,
  tableMinWidth,
  forceCompact,
  compactListVariant = 'entity',
}: {
  columns: number;
  rows?: number;
  tableMinWidth?: number;
  /** Force the compact list-row skeleton regardless of viewport — used when this
   * skeleton is rendered in the split-pane list column, which is narrow on desktop
   * too. Mirrors `LandingTable`'s `forceCompact`. */
  forceCompact?: boolean;
  /** Split-pane list row shape — `transaction` for estimates/orders/invoices. */
  compactListVariant?: SellerSplitListVariant;
}) {
  if (forceCompact) {
    return <SellerMobileListSkeleton count={rows} forceVisible variant={compactListVariant} />;
  }

  return (
    <div className="hidden min-w-0 max-w-full overflow-x-auto md:block">
        <div
          className="min-h-full overflow-hidden rounded-[14px] border border-cream-300 bg-white"
          style={tableMinWidth ? { minWidth: `${tableMinWidth}px` } : undefined}
        >
          <div className="border-b border-cream-200 p-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: columns }).map((_, index) => (
                <Skeleton key={`header-${index}`} className="h-3 w-full" />
              ))}
            </div>
          </div>
          <div className="p-3">
            <div className="space-y-3">
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <div
                  key={`row-${rowIndex}`}
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: columns }).map((_, colIndex) => (
                    <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-10 rounded-md" />
                  ))}
                </div>
              ))}
            </div>
        </div>
      </div>
    </div>
  );
}
