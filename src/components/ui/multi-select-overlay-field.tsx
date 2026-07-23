'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { SearchOverlayPicker } from '@/components/ui/search-overlay-picker';

export interface MultiSelectOverlayItem {
  id: string;
  title: string;
  description?: string;
}

export interface MultiSelectOverlayFieldProps {
  items: MultiSelectOverlayItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  title: string;
  emptySelectionLabel?: string;
  emptySelectionDescription?: string;
  searchPlaceholder?: string;
  countNoun?: string;
}

/**
 * Reusable stacked-overlay multi-select. Generalizes the brand-picker pattern that was
 * previously hand-rolled inside CustomerGroupFormSheet (SearchOverlayPicker + toggle rows)
 * so Brand and Category filters share one implementation everywhere (cohorts, price lists,
 * campaigns).
 */
export function MultiSelectOverlayField({
  items,
  selectedIds,
  onChange,
  title,
  emptySelectionLabel = 'All',
  emptySelectionDescription = 'No restriction',
  searchPlaceholder = 'Search…',
  countNoun = 'selected',
}: MultiSelectOverlayFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.title, item.description].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [items, search]);

  const selectedTitles = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)).map((item) => item.title),
    [items, selectedIds],
  );

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  };

  return (
    <SearchOverlayPicker
      open={open}
      onOpenChange={setOpen}
      title={title}
      triggerTitle={selectedTitles.length > 0 ? selectedTitles.join(', ') : emptySelectionLabel}
      triggerDescription={
        selectedTitles.length > 0
          ? `${selectedTitles.length} ${countNoun}`
          : emptySelectionDescription
      }
      searchValue={search}
      onSearchValueChange={setSearch}
      searchPlaceholder={searchPlaceholder}
    >
      <div className="overflow-hidden rounded-[8px] border border-cream-200 bg-white">
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors hover:bg-cream-50"
        >
          <div className="min-w-0">
            <p className="text-base font-medium text-cream-900">{emptySelectionLabel}</p>
            <p className="text-sm text-cream-700">{emptySelectionDescription}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
            {selectedIds.length === 0 ? 'Selected' : 'Add'}
          </span>
        </button>
        {filteredItems.map((item) => {
          const selected = selectedIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors last:border-b-0 hover:bg-cream-50"
            >
              <div className="min-w-0">
                <p className="text-base font-medium text-cream-900">{item.title}</p>
                {item.description ? <p className="text-sm text-cream-700">{item.description}</p> : null}
              </div>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                {selected ? 'Selected' : 'Add'}
              </span>
            </button>
          );
        })}
      </div>
    </SearchOverlayPicker>
  );
}
