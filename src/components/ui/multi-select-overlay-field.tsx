'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>(selectedIds);

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
  const draftSelectedTitles = useMemo(
    () => items.filter((item) => draftSelectedIds.includes(item.id)).map((item) => item.title),
    [draftSelectedIds, items],
  );

  const toggle = (id: string) => {
    setDraftSelectedIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  };

  const closePicker = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraftSelectedIds(selectedIds);
      return;
    }
    setSearch('');
  };

  return (
    <SearchOverlayPicker
      open={open}
      onOpenChange={closePicker}
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
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => closePicker(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onChange(draftSelectedIds);
              closePicker(false);
            }}
          >
            <Check className="h-3.5 w-3.5" />
            {`Select ${draftSelectedIds.length} ${countNoun}`}
          </Button>
        </div>
      )}
    >
      {draftSelectedTitles.length > 0 ? (
        <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Selected</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {draftSelectedIds.map((id) => {
              const item = items.find((entry) => entry.id === id);
              if (!item) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
                >
                  <span>{item.title}</span>
                  <span aria-hidden="true" className="text-teal-700">×</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[8px] border border-cream-200 bg-white">
        <button
          type="button"
          onClick={() => setDraftSelectedIds([])}
          className={[
            'flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors',
            draftSelectedIds.length === 0 ? 'border-ember-100 bg-ember-50' : 'hover:bg-cream-50',
          ].join(' ')}
        >
          <div className="min-w-0">
            <p className="text-base font-medium text-cream-900">{emptySelectionLabel}</p>
            <p className="text-sm text-cream-700">{emptySelectionDescription}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
            {draftSelectedIds.length === 0 ? 'Selected' : 'Add'}
          </span>
        </button>
        {filteredItems.map((item) => {
          const selected = draftSelectedIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={[
                'flex w-full items-center justify-between border-b border-cream-200 px-3 py-[10px] text-left transition-colors last:border-b-0',
                selected ? 'border-ember-100 bg-ember-50' : 'hover:bg-cream-50',
              ].join(' ')}
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
