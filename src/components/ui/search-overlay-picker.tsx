'use client';

import * as React from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { useStickyPickerHeader } from '@/hooks/useStickyPickerHeader';

interface SearchOverlayPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow?: string;
  description?: string;
  triggerTitle: string;
  triggerDescription?: string;
  triggerDisabled?: boolean;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  searchPlaceholder?: string;
  autoFocus?: boolean;
  loading?: boolean;
  /** Quick/advanced filters panel — rendered in the collapsible region, between search and selected items. */
  filtersPanel?: React.ReactNode;
  /** Select-all / clear-selection row — collapsible region, below filtersPanel. */
  selectionSummary?: React.ReactNode;
  /** Selected-items chips section — stays sticky-visible even when the header collapses. */
  selectedItemsSummary?: React.ReactNode;
  /** The scrollable row list (+ infinite-scroll sentinel). Scrolling this collapses/expands the header. */
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  bodyClassName?: string;
  inputClassName?: string;
  /** Review-only mode (e.g. automatic membership): rows aren't clickable, no select-all/clear row. */
  readOnly?: boolean;
  /** Banner shown under the search bar when `readOnly` — e.g. "Membership is automatic based on the selected filters." */
  readOnlyNote?: React.ReactNode;
}

export function SearchOverlayPicker({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  triggerTitle,
  triggerDescription,
  triggerDisabled = false,
  searchValue,
  onSearchValueChange,
  searchPlaceholder = 'Search…',
  autoFocus = true,
  loading = false,
  filtersPanel,
  selectionSummary,
  selectedItemsSummary,
  children,
  footer,
  className,
  triggerClassName,
  bodyClassName,
  inputClassName,
  readOnly = false,
  readOnlyNote,
}: SearchOverlayPickerProps) {
  const { collapsed, handleScroll, reset } = useStickyPickerHeader();

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const hasCollapsibleRegion = Boolean(filtersPanel || (!readOnly && selectionSummary));

  return (
    <>
      <button
        type="button"
        disabled={triggerDisabled}
        onClick={() => onOpenChange(true)}
        className={cn(
          'flex w-full items-center justify-between rounded-[8px] border border-cream-300 bg-white px-3 py-[10px] text-left transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-60',
          triggerClassName,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Search size={14} className="shrink-0 text-cream-700" />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-cream-900">{triggerTitle}</p>
            {triggerDescription ? (
              <p className="mt-0.5 text-sm text-cream-700">{triggerDescription}</p>
            ) : null}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-cream-500" />
      </button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            'flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white',
            className,
          )}
        >
          <SheetHeader className="flex-shrink-0 border-b border-cream-300 bg-white px-[22px] py-[18px]">
            <div className="pr-8">
              {eyebrow && !collapsed ? (
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">
                  {eyebrow}
                </p>
              ) : null}
              <SheetTitle className="font-display text-xl font-medium leading-[1.15] tracking-[-0.01em] text-cream-900">
                {title}
              </SheetTitle>
              {description && !collapsed ? (
                <p className="mt-1.5 text-sm leading-[1.5] text-cream-700">{description}</p>
              ) : null}
            </div>
          </SheetHeader>

          <div className={cn('shrink-0 space-y-3 border-b border-cream-300 bg-white px-[22px] py-3', bodyClassName)}>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-700"
              />
              <Input
                value={searchValue}
                onChange={(e) => onSearchValueChange(e.target.value)}
                className={cn('pl-8', inputClassName)}
                placeholder={searchPlaceholder}
                autoFocus={autoFocus}
              />
            </div>

            {readOnly && readOnlyNote ? (
              <p className="rounded-[8px] border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                {readOnlyNote}
              </p>
            ) : null}

            {selectedItemsSummary}
          </div>

          {hasCollapsibleRegion ? (
            <div
              className={cn(
                'shrink-0 overflow-hidden border-b border-cream-300 bg-white px-[22px] transition-[max-height,opacity] duration-200 ease-standard',
                collapsed ? 'max-h-0 border-b-0 py-0 opacity-0' : 'max-h-[600px] py-3 opacity-100',
              )}
            >
              <div className="space-y-3">
                {filtersPanel}
                {!readOnly ? selectionSummary : null}
              </div>
            </div>
          ) : null}

          <div
            aria-busy={loading}
            onScroll={handleScroll}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-[22px] py-3"
          >
            {children}
          </div>

          {footer ? <div className="border-t border-cream-300 bg-white px-[22px] py-[14px]">{footer}</div> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
