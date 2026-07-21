'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { EntityAvatar } from '@/components/seller/layout';
import { useOverlayPlacement } from '@/hooks/useOverlayPlacement';
import { cn, formatNumberValue } from '@/lib/utils';
import type { EstimateComposerProductSearchRow } from '@/types/estimate-composer';

export function ProductSearchDropdown({
  open,
  anchorRef,
  results,
  highlightedIndex,
  onHighlightChange,
  onSelect,
  listboxId,
  loading = false,
  isFetchingNextPage = false,
  hasMore = false,
  onLoadMore,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  results: EstimateComposerProductSearchRow[];
  highlightedIndex: number;
  onHighlightChange: (idx: number) => void;
  onSelect: (row: EstimateComposerProductSearchRow) => void;
  listboxId: string;
  loading?: boolean;
  isFetchingNextPage?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  const placement = useOverlayPlacement(open, anchorRef);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<{ left: number; top: number; width: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setGeometry(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setGeometry({
        left: rect.left,
        top: rect.bottom,
        width: rect.width,
        bottom: window.innerHeight - rect.top,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open || results.length === 0) return;
    const id = `${listboxId}-opt-${highlightedIndex}`;
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    const list = listRef.current;
    if (el instanceof HTMLElement && list) {
      const nextTop = el.offsetTop - list.clientTop;
      const nextBottom = nextTop + el.offsetHeight;
      const currentTop = list.scrollTop;
      const currentBottom = currentTop + list.clientHeight;
      if (nextTop < currentTop) {
        list.scrollTo({ top: nextTop, behavior: 'smooth' });
      } else if (nextBottom > currentBottom) {
        list.scrollTo({ top: nextBottom - list.clientHeight, behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, listboxId, open, results.length]);

  if (!open || (!loading && results.length === 0)) return null;

  if (!geometry) return null;

  const overlayStyle = placement === 'above'
    ? {
        position: 'fixed' as const,
        left: geometry.left,
        bottom: geometry.bottom + 2,
        width: geometry.width,
      }
    : {
        position: 'fixed' as const,
        left: geometry.left,
        top: geometry.top + 2,
        width: geometry.width,
      };

  const handleScroll = () => {
    if (!onLoadMore || loading || isFetchingNextPage || !hasMore) return;
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 40;
    if (nearBottom) onLoadMore();
  };

  return createPortal(
    <div
      id={listboxId}
      role="listbox"
      className={cn(
        'inline-search-overlay z-[90] overflow-hidden rounded-[12px] border border-cream-300 bg-white shadow-[0_18px_40px_rgba(34,52,43,0.12)]',
      )}
      style={overlayStyle}
    >
      <div className="flex items-center justify-between border-b border-cream-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">
        <span>Matching products</span>
        {loading || isFetchingNextPage ? (
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-cream-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Searching
          </span>
        ) : null}
      </div>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className={cn(
          'max-h-[220px] overflow-y-auto overscroll-contain scroll-smooth px-2 py-1.5',
          results.length === 0 && loading ? 'flex min-h-[140px] items-center justify-center' : '',
        )}
      >
        {loading && results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-cream-600">
            <Loader2 className="h-5 w-5 animate-spin text-cream-500" />
            <span>Searching products…</span>
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[112px] items-center justify-center py-6 text-sm text-cream-500">
            No matching products
          </div>
        ) : (
          <div className="space-y-1.5">
            {results.map((row, idx) => (
              <button
                key={row.tenant_product_id}
                id={`${listboxId}-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={idx === highlightedIndex}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[12px] border border-cream-200 bg-cream-50 px-3 py-2.5 text-left transition hover:border-cream-300 hover:bg-white',
                  idx === highlightedIndex && 'border-cream-300 bg-white',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHighlightChange(idx)}
                onClick={() => onSelect(row)}
              >
                <EntityAvatar initials={row.brand_initials} hue={row.brand_hue} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-cream-900">{row.product_name}</p>
                  <p className="truncate text-xs text-cream-600">
                    {row.brand_name} · {row.sku} · MRP {formatNumberValue(row.mrp, 'CURRENCY_EXACT')} · Base Price {formatNumberValue(row.base_selling_price, 'CURRENCY_EXACT')}
                    {row.unit_price !== row.base_selling_price ? ` · Price ${formatNumberValue(row.unit_price, 'CURRENCY_EXACT')}` : ''}
                  </p>
                </div>
              </button>
            ))}
            {isFetchingNextPage ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-cream-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading more
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
