'use client';

import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CategoryOption {
  id: string;
  name: string;
}

interface CategorySlotPickerProps {
  availableCategories: CategoryOption[];
  usedCategoryIds: Set<string>;
  onSelect: (categoryId: string) => void;
  disabled?: boolean;
}

export function CategorySlotPicker({
  availableCategories,
  usedCategoryIds,
  onSelect,
  disabled = false,
}: CategorySlotPickerProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableCategories.filter((cat) => {
      if (usedCategoryIds.has(cat.id)) return false;
      if (!q) return true;
      return cat.name.toLowerCase().includes(q);
    });
  }, [availableCategories, query, usedCategoryIds]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open || options.length === 0) return;
    const id = `${listboxId}-opt-${highlightedIndex}`;
    const el = document.getElementById(id);
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
  }, [highlightedIndex, listboxId, open, options.length]);

  function handleSelect(categoryId: string) {
    onSelect(categoryId);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((idx) => Math.min(idx + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((idx) => Math.max(idx - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = options[highlightedIndex];
      if (row) handleSelect(row.id);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown = open && (options.length > 0 || query.trim().length > 0);
  const activeDescendantId =
    options.length > 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
      <Input
        ref={inputRef}
        value={query}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendantId}
        disabled={disabled || availableCategories.length === usedCategoryIds.size}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        className="h-9 border-cream-300 pl-9 shadow-none"
        placeholder={
          availableCategories.length === usedCategoryIds.size
            ? 'All categories added'
            : 'Search category to add slot…'
        }
      />
      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          className="inline-search-overlay absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-[12px] border border-cream-300 bg-white shadow-[0_18px_40px_rgba(34,52,43,0.12)]"
        >
          <div className="border-b border-cream-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">
            Matching categories
          </div>
          <div
            ref={listRef}
            className="max-h-[200px] overflow-y-auto overscroll-contain scroll-smooth px-2 py-1.5"
          >
            {options.length === 0 ? (
              <div className="flex min-h-[80px] items-center justify-center py-4 text-sm text-cream-500">
                No matching categories
              </div>
            ) : (
              <div className="space-y-1">
                {options.map((cat, idx) => (
                  <button
                    key={cat.id}
                    id={`${listboxId}-opt-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={idx === highlightedIndex}
                    className={cn(
                      'flex w-full items-center rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2 text-left text-sm font-medium text-cream-900 transition hover:border-cream-300 hover:bg-white',
                      idx === highlightedIndex && 'border-cream-300 bg-white',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
