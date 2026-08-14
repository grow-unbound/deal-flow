'use client';

import { Fragment, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { RealtimeBadge } from '@/components/ui/RealtimeBadge';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  SELLER_SPLIT_LIST_META_CLASS,
  SELLER_SPLIT_LIST_PRIMARY_CLASS,
  SELLER_SPLIT_LIST_ROW_PADDING_CLASS,
  SELLER_SPLIT_LIST_TRAILING_CLASS,
  type SellerSplitListVariant,
} from '@/lib/seller-split-list-ui';
import { cn } from '@/lib/utils';

const SELECTED_VISIBILITY_PAD_PX = 8;

function getVerticalScrollParent(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function isFullyVisibleInScrollParent(node: HTMLElement, scrollParent: HTMLElement): boolean {
  const parentRect = scrollParent.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  return (
    nodeRect.top >= parentRect.top + SELECTED_VISIBILITY_PAD_PX
    && nodeRect.bottom <= parentRect.bottom - SELECTED_VISIBILITY_PAD_PX
  );
}

/** Bring the open split-pane row into the list scrollport when it would otherwise be clipped. */
function scrollSelectedSplitListItemIntoView(listRoot: HTMLElement, selectedId: string): void {
  const active = listRoot.querySelector<HTMLElement>(`[data-split-list-id="${CSS.escape(selectedId)}"]`);
  if (!active || typeof active.scrollIntoView !== 'function') return;

  const scrollParent = getVerticalScrollParent(active);
  if (scrollParent && isFullyVisibleInScrollParent(active, scrollParent)) return;

  active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
}

export interface SellerMobileListItem {
  id: string;
  href: string;
  primary: ReactNode;
  /** Short identifier above the primary label (SKU, doc #, cohort, etc.). */
  eyebrow?: ReactNode;
  /** Optional avatar/thumbnail shown left of the text column (split-pane + mobile cards). */
  leading?: ReactNode;
  trailing?: ReactNode;
  supporting?: ReactNode;
  /** @deprecated Prefer a single `supporting` string joined with ` · `. Still merged for legacy rows. */
  meta?: ReactNode;
  status?: {
    label: string;
    tone: StatusTone;
  };
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
  /** Per-row ref registrar for viewport-gated enrichment (e.g. lazy image/stock hydration). */
  registerItemRef?: (id: string) => (el: HTMLElement | null) => void;
}

const SPLIT_LIST_PRIMARY_CLASS = SELLER_SPLIT_LIST_PRIMARY_CLASS;
const SPLIT_LIST_META_CLASS = SELLER_SPLIT_LIST_META_CLASS;
const SPLIT_LIST_TRAILING_CLASS = SELLER_SPLIT_LIST_TRAILING_CLASS;

function splitListSupportingText(item: SellerMobileListItem): ReactNode | null {
  if (item.supporting && item.meta) {
    return (
      <>
        {item.supporting} · {item.meta}
      </>
    );
  }

  return item.supporting ?? item.meta ?? null;
}

/** Unified split-pane row — optional leading avatar, eyebrow, primary, supporting, trailing. */
function SellerSplitListItemContent({ item }: { item: SellerMobileListItem }) {
  const supporting = splitListSupportingText(item);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {item.leading ? <div className="mt-0.5 shrink-0">{item.leading}</div> : null}
        <div className="min-w-0 flex-1">
          {item.eyebrow ? (
            <div className="flex min-w-0 items-center gap-2">
              <p className={cn('min-w-0 flex-1 font-mono', SPLIT_LIST_META_CLASS, 'mt-0')}>{item.eyebrow}</p>
              {item.badge ? <RealtimeBadge type={item.badge} className="shrink-0" /> : null}
            </div>
          ) : null}
          <p className={cn(SPLIT_LIST_PRIMARY_CLASS, item.eyebrow ? 'mt-1' : undefined)}>{item.primary}</p>
          {supporting ? <p className={SPLIT_LIST_META_CLASS}>{supporting}</p> : null}
        </div>
      </div>
      {item.trailing || item.status ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.status ? <StatusPill label={item.status.label} tone={item.status.tone} /> : null}
          {item.trailing ? <p className={SPLIT_LIST_TRAILING_CLASS}>{item.trailing}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function SellerSplitListItemSkeleton({
  showStatus = false,
  showLeading = false,
}: {
  showStatus?: boolean;
  showLeading?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {showLeading ? <div className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-full bg-cream-200" /> : null}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded-full bg-cream-200" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-cream-200" />
          <div className="h-3 w-48 animate-pulse rounded-full bg-cream-200" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {showStatus ? <div className="h-5 w-16 animate-pulse rounded-full bg-cream-200" /> : null}
        <div className="h-4 w-10 animate-pulse rounded-full bg-cream-200" />
      </div>
    </div>
  );
}

export function SellerMobileList({ items, className, emptyState, forceVisible, sentinelIndex, sentinelRef, registerItemRef }: SellerMobileListProps) {
  const listRootRef = useRef<HTMLDivElement>(null);
  const selectedId = items.find((item) => item.selected)?.id ?? null;

  // Split-pane list remounts at scrollTop=0 when forceCompact flips on — without this,
  // a mid-table selection opens with the ember highlight off-screen and no cue which
  // row is active. Skip when already fully visible so in-pane clicks don't jump.
  useLayoutEffect(() => {
    if (!forceVisible || !selectedId) return;
    const listRoot = listRootRef.current;
    if (!listRoot) return;

    scrollSelectedSplitListItemIntoView(listRoot, selectedId);
    // ResizablePanel applies the 30/70 split after the first layout pass — re-center once
    // sizes settle so the row isn't clipped by the narrowed list column.
    const frame = requestAnimationFrame(() => {
      scrollSelectedSplitListItemIntoView(listRoot, selectedId);
    });
    return () => cancelAnimationFrame(frame);
  }, [forceVisible, selectedId, items.length]);

  if (items.length === 0 && emptyState) {
    return <div className={forceVisible ? undefined : 'md:hidden'}>{emptyState}</div>;
  }

  if (forceVisible) {
    return (
      <div
        ref={listRootRef}
        className={cn('rounded-b-[14px] border border-cream-300 border-t-0 bg-white', className)}
      >
        <div className="divide-y divide-cream-200">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index === sentinelIndex && sentinelRef ? (
                <div ref={sentinelRef} className="h-px" aria-hidden />
              ) : null}
              <Link
                href={item.href}
                onClick={item.onClick}
                data-split-list-id={item.id}
                aria-current={item.selected ? 'page' : undefined}
                ref={registerItemRef?.(item.id)}
                className={cn(
                  'block text-left no-underline transition-colors hover:bg-cream-50',
                  SELLER_SPLIT_LIST_ROW_PADDING_CLASS,
                  item.selected ? 'bg-ember-50 hover:bg-ember-50' : 'bg-transparent',
                )}
              >
                <SellerSplitListItemContent item={item} />
              </Link>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('md:hidden', className)}>
      <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index === sentinelIndex && sentinelRef ? (
              <div ref={sentinelRef} className="h-px" aria-hidden />
            ) : null}
            <Link
              href={item.href}
              onClick={item.onClick}
              ref={registerItemRef?.(item.id)}
              className={cn(
                'block rounded-[12px] border px-3.5 py-3 text-left no-underline transition-colors active:bg-cream-100',
                item.selected ? 'border-ember-300 bg-ember-50' : item.eyebrow ? 'border-[var(--border-1)] bg-white' : 'border-cream-200 bg-white',
              )}
            >
              {item.eyebrow ? (
                <SellerSplitListItemContent item={item} />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  {item.leading ? <div className="shrink-0">{item.leading}</div> : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 truncate text-[var(--b-text-body)] font-semibold text-cream-900">
                        {item.primary}
                      </p>
                      {item.badge ? <RealtimeBadge type={item.badge} className="shrink-0" /> : null}
                    </div>
                    {item.supporting ? (
                      <p className="mt-0.5 truncate text-[var(--b-text-body)] text-cream-700">{item.supporting}</p>
                    ) : null}
                    {item.meta ? (
                      <p className="mt-0.5 truncate text-[var(--b-text-sub)] text-cream-600">{item.meta}</p>
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
              )}
            </Link>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function SellerMobileListSkeleton({
  count = 6,
  forceVisible,
  variant = 'entity',
  showLeading = false,
}: {
  count?: number;
  forceVisible?: boolean;
  /** `transaction` rows include a status-pill placeholder on the right. */
  variant?: SellerSplitListVariant;
  /** Avatar column placeholder (products, brands, categories split lists). */
  showLeading?: boolean;
}) {
  const showStatus = variant === 'transaction';

  if (forceVisible) {
    return (
      <div className="rounded-b-[14px] border border-cream-300 border-t-0 bg-white" role="status" aria-label="Loading list">
        <div className="divide-y divide-cream-200">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className={SELLER_SPLIT_LIST_ROW_PADDING_CLASS}>
              <SellerSplitListItemSkeleton showStatus={showStatus} showLeading={showLeading} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('px-4 pt-3 pb-2', 'md:hidden')} role="status" aria-label="Loading list">
      <div className="flex flex-col gap-2">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="rounded-[12px] border border-cream-200 bg-white px-3.5 py-3">
            <SellerSplitListItemSkeleton showStatus={showStatus} showLeading={showLeading} />
          </div>
        ))}
      </div>
    </div>
  );
}
