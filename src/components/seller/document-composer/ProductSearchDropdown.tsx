'use client';

import { useEffect, useRef } from 'react';

import { EntityAvatar } from '@/components/seller/layout';
import { useOverlayPlacement } from '@/hooks/useOverlayPlacement';
import { cn, formatInr } from '@/lib/utils';
import type { EstimateComposerProductSearchRow } from '@/types/estimate-composer';

export function ProductSearchDropdown({
  open,
  anchorRef,
  results,
  highlightedIndex,
  onHighlightChange,
  onSelect,
  listboxId,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  results: EstimateComposerProductSearchRow[];
  highlightedIndex: number;
  onHighlightChange: (idx: number) => void;
  onSelect: (row: EstimateComposerProductSearchRow) => void;
  listboxId: string;
}) {
  const placement = useOverlayPlacement(open, anchorRef);
  const listRef = useRef<HTMLDivElement | null>(null);

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

  if (!open || results.length === 0) return null;

  return (
    <div
      id={listboxId}
      role="listbox"
      className={cn(
        'inline-search-overlay absolute left-0 right-0 z-30 overflow-hidden rounded-[12px] border border-cream-300 bg-white shadow-[0_18px_40px_rgba(34,52,43,0.12)]',
        placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
      )}
    >
      <div className="border-b border-cream-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
        Matching products
      </div>
      <div ref={listRef} className="max-h-[220px] overflow-y-auto overscroll-contain scroll-smooth p-2">
        <div className="space-y-2">
          {results.map((row, idx) => (
            <button
              key={row.tenant_product_id}
              id={`${listboxId}-opt-${idx}`}
              type="button"
              role="option"
              aria-selected={idx === highlightedIndex}
              className={cn(
                'flex w-full items-center gap-3 rounded-[12px] border border-cream-200 bg-cream-50 px-3 py-3 text-left transition hover:border-cream-300 hover:bg-white',
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
                  {row.brand_name} · {row.sku} · MRP {formatInr(row.mrp)} · Base {formatInr(row.base_selling_price)}
                  {row.unit_price !== row.base_selling_price ? ` · Price ${formatInr(row.unit_price)}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
