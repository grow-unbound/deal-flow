import { Fragment, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import { cn } from '@/lib/utils';

export interface SellerMobileListItem {
  id: string;
  href: string;
  primary: ReactNode;
  trailing?: ReactNode;
  supporting?: ReactNode;
  meta?: ReactNode;
  badge?: 'new' | 'updated';
  onClick?: () => void;
  /** Highlights this card as the currently-open record — used by the split-pane
   * list column so the selection stays visible while browsing. */
  selected?: boolean;
}

interface SellerMobileListProps {
  items: SellerMobileListItem[];
  className?: string;
  emptyState?: ReactNode;
  /** Render regardless of viewport — used by the split-pane list column, which is
   * narrow on desktop too and reuses this same compact card format. */
  forceVisible?: boolean;
  /** Array index at which to interleave the infinite-scroll sentinel (mid-list, not
   * trailing) — see `getSentinelInsertIndex` in `useInfiniteScroll.ts`. */
  sentinelIndex?: number;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}

export function SellerMobileList({ items, className, emptyState, forceVisible, sentinelIndex, sentinelRef }: SellerMobileListProps) {
  if (items.length === 0 && emptyState) {
    return <div className={forceVisible ? undefined : 'md:hidden'}>{emptyState}</div>;
  }

  if (forceVisible) {
    // Split-pane desktop list column: a subtle line-separated list (like a
    // condensed table), not touch-sized cards — the pane is narrow but this is
    // still a mouse/trackpad surface. Rounded-bottom + bordered like the
    // desktop table's own ScrollableTableShell, so it reads as one connected
    // panel continuing from the FilterBar above rather than blending into the
    // page background.
    return (
      <div className={cn('rounded-b-[14px] border border-cream-300 border-t-0 bg-white', className)}>
        <div className="divide-y divide-cream-200">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index === sentinelIndex && sentinelRef ? (
                <div ref={sentinelRef} className="h-px" aria-hidden />
              ) : null}
              <Link
                href={item.href}
                onClick={item.onClick}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-3.5 text-left no-underline transition-colors hover:bg-cream-50',
                  item.selected ? 'bg-ember-50 hover:bg-ember-50' : 'bg-transparent',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 truncate text-[var(--b-text-body)] font-medium text-cream-900">
                      {item.primary}
                    </p>
                    {item.badge ? <RealtimeBadge type={item.badge} className="shrink-0" /> : null}
                  </div>
                  {item.supporting || item.meta ? (
                    <p className="mt-1 truncate text-sm text-cream-600">
                      {item.supporting}
                      {item.supporting && item.meta ? ' · ' : null}
                      {item.meta}
                    </p>
                  ) : null}
                </div>
                {item.trailing ? (
                  <p className="shrink-0 max-w-[8.5rem] truncate text-right text-[var(--b-text-body)] font-medium text-cream-900">
                    {item.trailing}
                  </p>
                ) : null}
              </Link>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('md:hidden', className)}>
      <div className="flex flex-col gap-2 px-3 py-2">
        {items.map((item, index) => (
          <Fragment key={item.id}>
          {index === sentinelIndex && sentinelRef ? (
            <div ref={sentinelRef} className="h-px" aria-hidden />
          ) : null}
          <Link
            href={item.href}
            onClick={item.onClick}
            className={cn(
              'block rounded-[12px] border px-3.5 py-3 text-left no-underline transition-colors active:bg-cream-100',
              item.selected ? 'border-ember-300 bg-ember-50' : 'border-cream-200 bg-white',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 truncate text-[var(--b-text-body)] font-semibold text-cream-900">
                    {item.primary}
                  </p>
                  {item.badge ? <RealtimeBadge type={item.badge} className="shrink-0" /> : null}
                </div>
                {item.supporting ? (
                  <p className="mt-0.5 truncate text-[var(--b-text-body)] text-cream-700">
                    {item.supporting}
                  </p>
                ) : null}
                {item.meta ? (
                  <p className="mt-0.5 truncate text-[var(--b-text-sub)] text-cream-600">
                    {item.meta}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                {item.trailing ? (
                  <p className="max-w-[8.5rem] truncate text-right text-[var(--b-text-body)] font-semibold text-cream-900">
                    {item.trailing}
                  </p>
                ) : null}
                <ChevronRight className="mt-0.5 h-4 w-4 text-cream-500" aria-hidden />
              </div>
            </div>
          </Link>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function SellerMobileListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="md:hidden px-3 py-2" role="status" aria-label="Loading list">
      <div className="flex flex-col gap-2">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="rounded-[12px] border border-cream-200 bg-white px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-36 animate-pulse rounded-full bg-cream-200" />
                <div className="h-3 w-48 animate-pulse rounded-full bg-cream-200" />
                <div className="h-3 w-28 animate-pulse rounded-full bg-cream-100" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded-full bg-cream-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
