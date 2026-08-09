import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';

import { SellerMobileList, type SellerMobileListItem } from '@/components/seller/mobile';

/** Standard body-cell padding for seller landing / data tables. */
export const LANDING_TABLE_CELL_CLASS = 'px-3 py-3';

interface LandingTableColumn {
  label?: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  className?: string;
}

interface LandingTableProps {
  columns: LandingTableColumn[];
  children: ReactNode;
  className?: string;
  /** Merged onto `<table>` (e.g. `v2-table` from design system). */
  tableClassName?: string;
  /** Optional minimum table width so the shell scrolls instead of compressing columns. */
  tableMinWidth?: number | string;
  /** When true, render `emptyState` as the sole body row instead of `children`. */
  showEmptyState?: boolean;
  /** Shown when `showEmptyState` is true (e.g. `<EmptyState ... />`). */
  emptyState?: ReactNode;
  /** Compact phone rendering for the same rows; desktop table remains unchanged. */
  mobileRows?: SellerMobileListItem[];
  /** Force the compact `mobileRows` card list regardless of viewport — used when this
   * table is rendered in the split-pane list column, which is narrow on desktop too.
   * Skips the wide `<table>` entirely rather than just CSS-hiding it. */
  forceCompact?: boolean;
  /** When true, only horizontal overflow scrolls on this shell — vertical growth
   * stays on the page (or split-pane ancestor). Drops the capped max-height so
   * long lists are not clipped inside a short box. */
  horizontalScrollOnly?: boolean;
  /** Array index at which to interleave the infinite-scroll sentinel (mid-list, not
   * trailing) — forwarded to `SellerMobileList`. */
  sentinelIndex?: number;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}

export function LandingTable({
  columns,
  children,
  className,
  tableClassName,
  tableMinWidth,
  showEmptyState,
  emptyState,
  mobileRows,
  forceCompact,
  horizontalScrollOnly,
  sentinelIndex,
  sentinelRef,
}: LandingTableProps) {
  const hasHeader = columns.some((column) => column.label != null && column.label !== '');

  if (forceCompact) {
    return mobileRows ? (
      <SellerMobileList
        items={showEmptyState ? [] : mobileRows}
        emptyState={showEmptyState ? emptyState : undefined}
        forceVisible
        sentinelIndex={sentinelIndex}
        sentinelRef={sentinelRef}
      />
    ) : null;
  }

  return (
    <>
      {mobileRows ? (
        <SellerMobileList
          items={showEmptyState ? [] : mobileRows}
          emptyState={showEmptyState ? emptyState : undefined}
          sentinelIndex={sentinelIndex}
          sentinelRef={sentinelRef}
        />
      ) : null}
      {/* Single scroll container for BOTH axes (not a horizontal-only
          ScrollableTableShell nested inside a vertical one) — sticky
          positioning anchors to the nearest ancestor that establishes a
          scroll container, on ANY axis. Splitting x/y overflow across two
          nested divs made the horizontal-only wrapper "win" that anchor,
          so the sticky `<thead>` stuck to a box that never itself scrolled
          vertically, instead of the page's real scrolling ancestor. */}
      <div
        className={cn(
          'min-h-0 w-full min-w-0 max-w-full rounded-b-[14px] border border-cream-300 border-t-0 bg-white',
          horizontalScrollOnly
            ? 'h-auto max-h-none overflow-x-auto overflow-y-visible'
            : 'h-full max-h-[calc(100dvh-var(--topbar-h)-18rem)] overflow-auto',
          mobileRows && 'hidden md:block',
          className,
        )}
      >
        <table
          className={cn('landing-table w-full min-w-[960px] table-fixed border-collapse text-base', tableClassName)}
          style={tableMinWidth != null ? { minWidth: tableMinWidth } : undefined}
        >
          {hasHeader ? (
            <thead className="sticky top-0 z-10">
              <tr className="border-y border-cream-300 bg-white">
                {columns.map((column, index) => (
                  <th
                    key={`${column.label ?? 'col'}-${index}`}
                    className={cn(
                      'table-label px-3 py-2 text-left text-cream-700',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.className
                    )}
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                      maxWidth: column.maxWidth,
                    }}
                  >
                    {column.label ?? ''}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {showEmptyState && emptyState ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="p-0">
                  {emptyState}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
