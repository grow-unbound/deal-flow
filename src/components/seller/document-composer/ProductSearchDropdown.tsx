'use client';

import { useEffect } from 'react';

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

  useEffect(() => {
    if (!open || results.length === 0) return;
    const id = `${listboxId}-opt-${highlightedIndex}`;
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [highlightedIndex, listboxId, open, results.length]);

  if (!open || results.length === 0) return null;

  return (
    <div
      id={listboxId}
      role="listbox"
      className={cn(
        'inline-search-overlay absolute left-0 right-0 z-30 max-h-[220px] overflow-auto rounded-[12px] border border-cream-300 bg-white shadow-md',
        placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      {results.map((row, idx) => (
        <button
          key={row.tenant_product_id}
          id={`${listboxId}-opt-${idx}`}
          type="button"
          role="option"
          aria-selected={idx === highlightedIndex}
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-cream-50',
            idx === highlightedIndex && 'bg-cream-100',
          )}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlightChange(idx)}
          onClick={() => onSelect(row)}
        >
          <EntityAvatar initials={row.brand_initials} hue={row.brand_hue} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-cream-900">{row.product_name}</p>
            <p className="truncate text-[11px] text-cream-600">
              {row.brand_name} · {row.sku} · MRP {formatInr(row.mrp)} · Base {formatInr(row.base_selling_price)}
              {row.unit_price !== row.base_selling_price ? ` · Price ${formatInr(row.unit_price)}` : ''}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
