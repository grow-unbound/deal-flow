'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectedItemsChip {
  id: string;
  label: string;
}

/**
 * Selected-items chips section shared across all picker overlays. Defaults to a ~2-line
 * collapsed height (chips beyond that scroll under a max-height once expanded) with a
 * chevron to open the full list — avoids the section growing unbounded when many items
 * are selected, while staying in the sticky header region.
 */
export function SelectedItemsChipsPanel({
  label,
  items,
  onRemove,
}: {
  label: string;
  items: SelectedItemsChip[];
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">{label}</p>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-800"
          aria-label={expanded ? `Collapse ${label.toLowerCase()}` : `Expand ${label.toLowerCase()}`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      <div
        className={cn(
          'mt-2 overflow-hidden transition-[max-height] duration-200',
          expanded ? 'max-h-40 overflow-y-auto' : 'max-h-10',
        )}
      >
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRemove(item.id)}
              className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
            >
              <span>{item.label}</span>
              <span aria-hidden="true" className="text-teal-700">×</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
