'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

export interface PickerItem {
  id: string;
  title: string;
  description?: string | null;
  meta?: string | null;
}

interface PickerListProps {
  items: PickerItem[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  emptyLabel?: string;
  nullOptionLabel?: string;
  nullOptionDescription?: string;
}

function PickerList({
  items,
  selectedId,
  onSelect,
  emptyLabel = 'No results found.',
  nullOptionLabel = 'No default cohort',
  nullOptionDescription = 'Leave unassigned for now.',
}: PickerListProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'flex w-full items-center justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
          selectedId == null ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
        )}
      >
        <div>
          <p className="text-[13.5px] font-medium text-cream-900">{nullOptionLabel}</p>
          <p className="text-[11.5px] text-cream-700">{nullOptionDescription}</p>
        </div>
        {selectedId == null ? <Check size={14} className="shrink-0 text-ember-500" /> : null}
      </button>

      {items.length === 0 ? (
        <div className="rounded-[8px] border border-cream-200 bg-white px-4 py-5 text-[13px] text-cream-500">
          {emptyLabel}
        </div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'flex w-full items-start justify-between rounded-[8px] px-3 py-[10px] text-left transition-colors',
              selectedId === item.id ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
            )}
          >
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-cream-900">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-[11.5px] text-cream-700">{item.description}</p>
              ) : null}
              {item.meta ? (
                <p className="mt-0.5 text-[11.5px] text-cream-700">{item.meta}</p>
              ) : null}
            </div>
            {selectedId === item.id ? <Check size={14} className="mt-0.5 shrink-0 text-ember-500" /> : null}
          </button>
        ))
      )}
    </div>
  );
}

function PickerSkeleton() {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[52px] animate-pulse rounded-[8px] bg-cream-100" />
      ))}
    </div>
  );
}

interface StackedPickerFieldProps {
  title: string;
  items: PickerItem[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  mode: 'inline' | 'stacked';
  searchPlaceholder?: string;
  emptyLabel?: string;
  nullOptionLabel?: string;
  nullOptionDescription?: string;
  previewCount?: number;
  disabled?: boolean;
}

export function StackedPickerField({
  title,
  items,
  selectedId,
  onSelect,
  mode,
  searchPlaceholder = 'Search…',
  emptyLabel,
  nullOptionLabel,
  nullOptionDescription,
  previewCount = 5,
  disabled = false,
}: StackedPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [inputQuery, setInputQuery] = useState('');
  const debouncedQuery = useDebounce(inputQuery, 300);
  const isFiltering = inputQuery.trim() !== debouncedQuery.trim();

  const filtered = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.title, item.description, item.meta]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(normalized)),
    );
  }, [items, debouncedQuery]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const previewItems = filtered.slice(0, previewCount);

  if (mode === 'inline') {
    const displayLabel = selectedItem?.title ?? nullOptionLabel ?? 'No default cohort';
    const isNullSelected = selectedId == null;

    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setInputQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex w-full items-center justify-between rounded-[8px] border px-3 py-[10px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2',
              isNullSelected
                ? 'border-cream-300 bg-white hover:bg-cream-50'
                : 'border-ember-200 bg-ember-50 hover:bg-ember-100',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Search size={14} className="shrink-0 text-cream-700" />
              <span
                className={cn(
                  'truncate text-[13.5px]',
                  isNullSelected ? 'text-cream-500' : 'font-medium text-cream-900',
                )}
              >
                {displayLabel}
              </span>
            </div>
            {isNullSelected ? (
              <ChevronDown size={14} className="shrink-0 text-cream-500" />
            ) : (
              <Check size={14} className="shrink-0 text-ember-500" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="overflow-hidden rounded-[12px] border-cream-300 bg-white p-0 shadow-[0_12px_32px_rgba(20,40,35,0.12),0_2px_6px_rgba(20,40,35,0.05)]"
          style={{ width: 'max(var(--radix-popover-trigger-width, 288px), 288px)' }}
        >
          {/* Search input */}
          <div className="border-b border-cream-200 p-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
              <Input
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                className="pl-8 pr-16 text-[13px]"
                placeholder={searchPlaceholder}
                autoFocus
              />
              {inputQuery.trim() && !isFiltering ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-cream-500">
                  {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
                </span>
              ) : null}
            </div>
          </div>

          {/* Results or skeleton */}
          <div className="max-h-[260px] overflow-y-auto p-1.5">
            {isFiltering ? (
              <PickerSkeleton />
            ) : (
              <PickerList
                items={previewItems}
                selectedId={selectedId}
                onSelect={(id) => {
                  onSelect(id);
                  setInputQuery('');
                  setOpen(false);
                }}
                emptyLabel={emptyLabel}
                nullOptionLabel={nullOptionLabel}
                nullOptionDescription={nullOptionDescription}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // ── Stacked mode ─────────────────────────────────────────────────────────────

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-[8px] border border-cream-300 bg-white px-3 py-[10px] text-left transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Search size={14} className="shrink-0 text-cream-700" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-cream-900">
              {selectedItem?.title ?? 'Search cohorts'}
            </p>
            <p className="mt-0.5 text-[11.5px] text-cream-700">
              {selectedItem?.meta ?? 'Browse all cohorts in a stacked picker'}
            </p>
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-cream-500" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white">
          <SheetHeader className="flex-shrink-0 border-b border-cream-300 bg-white px-[22px] py-[18px]">
            <SheetTitle className="font-display text-[22px] font-medium leading-[1.15] tracking-[-0.01em] text-cream-900">
              {title}
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700" />
              <Input
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                className="pl-8"
                placeholder={searchPlaceholder}
              />
            </div>
            <PickerList
              items={isFiltering ? [] : filtered}
              selectedId={selectedId}
              emptyLabel={isFiltering ? undefined : emptyLabel}
              nullOptionLabel={nullOptionLabel}
              nullOptionDescription={nullOptionDescription}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
