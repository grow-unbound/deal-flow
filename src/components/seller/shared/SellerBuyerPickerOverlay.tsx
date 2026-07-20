'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Search, Users } from 'lucide-react';

import { EntityAvatar } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCatalogComposerBuyerPicker, type CatalogComposerBuyerPickerRow } from '@/hooks/useCatalogs';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { cn, formatNumberValue } from '@/lib/utils';

type BuyerPickerFilters = {
  city: string[];
  cohort: string[];
  orders: string[];
  dues: string[];
};

function formatBuyerLastOrderedLabel(value: string | null) {
  if (!value) return 'never';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays <= 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatBuyerSecondaryText(buyer: CatalogComposerBuyerPickerRow) {
  return `${formatNumberValue(buyer.spend_mtd, 'CURRENCY_EXACT')} spend MTD · ${formatNumberValue(buyer.outstanding_due, 'CURRENCY_EXACT')} due · Last ordered ${formatBuyerLastOrderedLabel(buyer.last_order_at)}`;
}

function describeBuyerFilterValues(
  values: string[],
  options: Array<{ value: string; label: string }>,
) {
  if (values.length === 0) return 'All';
  const labels = values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .filter(Boolean);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function BuyerFilterDropdown({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
}) {
  const selectionLabel = describeBuyerFilterValues(values, options);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-sm font-medium transition-colors',
          values.length > 0
            ? 'border-teal-300 bg-teal-50 text-teal-800'
            : 'border-cream-300 bg-white text-cream-700 hover:bg-cream-50',
        )}
      >
        <span>{label}</span>
        <span className="max-w-[10rem] truncate text-cream-600">{selectionLabel}</span>
        <ChevronDown className="h-4 w-4 text-current" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() =>
                onChange(
                  selected
                    ? values.filter((value) => value !== option.value)
                    : [...values, option.value],
                )
              }
              className="justify-between"
            >
              <span>{option.label}</span>
              <Check className={cn('h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BuyerResultsSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-[8px] px-3 py-[10px]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-[10px] bg-cream-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-cream-100" />
              <div className="h-3 w-64 animate-pulse rounded bg-cream-100" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-cream-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SellerBuyerPickerOverlay({
  open,
  onOpenChange,
  title,
  selectedBuyerIds,
  onSelectedBuyerIdsChange,
  onApply,
  clearSelectionLabel = 'Clear selection',
  applyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  selectedBuyerIds: string[];
  onSelectedBuyerIdsChange: (ids: string[]) => void;
  onApply?: () => void;
  clearSelectionLabel?: string;
  applyLabel?: string;
}) {
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerFilters, setBuyerFilters] = useState<BuyerPickerFilters>({ city: [], cohort: [], orders: [], dues: [] });
  const [buyerPickerCache, setBuyerPickerCache] = useState<Record<string, CatalogComposerBuyerPickerRow>>({});
  const [selectedBuyerChipsExpanded, setSelectedBuyerChipsExpanded] = useState(false);
  const debouncedBuyerSearch = useDebounce(buyerSearch, 300);

  const buyerPickerQuery = useCatalogComposerBuyerPicker({
    query: debouncedBuyerSearch,
    city: buyerFilters.city,
    cohort: buyerFilters.cohort,
    orders: buyerFilters.orders,
    dues: buyerFilters.dues,
    selectedIds: selectedBuyerIds,
    enabled: open,
  });

  const { sentinelRef } = useInfiniteScroll({
    hasMore: buyerPickerQuery.hasNextPage ?? false,
    isLoading: buyerPickerQuery.isFetchingNextPage,
    rootMargin: '240px',
    onLoadMore: () => {
      void buyerPickerQuery.fetchNextPage();
    },
  });

  const buyerPickerRows = useMemo(
    () => buyerPickerQuery.data?.pages.flatMap((page) => page.buyers) ?? [],
    [buyerPickerQuery.data?.pages],
  );
  const buyerFilterGroups = buyerPickerQuery.data?.pages[0]?.filters.groups ?? [];
  const selectedBuyerSet = useMemo(() => new Set(selectedBuyerIds), [selectedBuyerIds]);
  const allFilteredBuyerIds = useMemo(() => buyerPickerRows.map((buyer) => buyer.id), [buyerPickerRows]);
  const allFilteredSelected = allFilteredBuyerIds.length > 0 && allFilteredBuyerIds.every((id) => selectedBuyerSet.has(id));
  const isRefetchingResults = buyerPickerQuery.isFetching
    && !buyerPickerQuery.isFetchingNextPage
    && buyerPickerQuery.isPlaceholderData;
  const hasActiveFilters = buyerFilters.city.length > 0
    || buyerFilters.cohort.length > 0
    || buyerFilters.orders.length > 0
    || buyerFilters.dues.length > 0
    || Boolean(buyerSearch.trim());

  useEffect(() => {
    if (!buyerPickerQuery.data) return;
    setBuyerPickerCache((current) => {
      const next = { ...current };
      for (const buyer of [
        ...buyerPickerQuery.data.pages.flatMap((page) => page.buyers),
        ...buyerPickerQuery.data.pages.flatMap((page) => page.selected_buyers),
      ]) {
        next[buyer.id] = buyer;
      }
      return next;
    });
  }, [buyerPickerQuery.data]);

  useEffect(() => {
    if (open) return;
    setBuyerSearch('');
    setBuyerFilters({ city: [], cohort: [], orders: [], dues: [] });
    setSelectedBuyerChipsExpanded(false);
  }, [open]);

  function updateBuyerFilter(key: keyof BuyerPickerFilters, values: string[]) {
    setBuyerFilters((current) => ({ ...current, [key]: values }));
  }

  function cacheBuyerRow(buyer: CatalogComposerBuyerPickerRow) {
    setBuyerPickerCache((current) => {
      if (current[buyer.id]) return current;
      return { ...current, [buyer.id]: buyer };
    });
  }

  function toggleBuyerSelection(buyer: CatalogComposerBuyerPickerRow) {
    const checked = selectedBuyerSet.has(buyer.id);
    if (!checked) {
      cacheBuyerRow(buyer);
    }
    onSelectedBuyerIdsChange(
      checked
        ? selectedBuyerIds.filter((id) => id !== buyer.id)
        : Array.from(new Set([...selectedBuyerIds, buyer.id])),
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-[540px] flex-col p-0">
        <SheetHeader className="pr-12">
          <SheetTitle>{title}</SheetTitle>
          <div className="mt-2 flex items-center gap-2 text-sm text-cream-700">
            <Users className="h-4 w-4 text-teal-700" />
            <span>{selectedBuyerIds.length} buyers selected</span>
          </div>
        </SheetHeader>
        <SheetBody className="flex min-h-0 flex-1 flex-col space-y-0 overflow-hidden px-5 py-4">
          <div className="shrink-0 space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
              <Input
                value={buyerSearch}
                onChange={(event) => setBuyerSearch(event.target.value)}
                placeholder="Search buyer, phone, or city"
                className="pl-9"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {buyerFilterGroups.map((group) => {
                  const values = buyerFilters[group.key as keyof BuyerPickerFilters] ?? [];
                  return (
                    <BuyerFilterDropdown
                      key={group.key}
                      label={group.label}
                      values={values}
                      options={group.options}
                      onChange={(values) => updateBuyerFilter(group.key as keyof BuyerPickerFilters, values)}
                    />
                  );
                })}
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                  onClick={() => {
                    setBuyerSearch('');
                    setBuyerFilters({ city: [], cohort: [], orders: [], dues: [] });
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
            {selectedBuyerIds.length > 0 ? (
              <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Selected buyers</p>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-800"
                    aria-label={selectedBuyerChipsExpanded ? 'Collapse selected buyers' : 'Expand selected buyers'}
                    onClick={() => setSelectedBuyerChipsExpanded((current) => !current)}
                  >
                    {selectedBuyerChipsExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div
                  className={cn(
                    'mt-2 overflow-hidden transition-[max-height] duration-200',
                    selectedBuyerChipsExpanded ? 'max-h-40 overflow-y-auto' : 'max-h-10',
                  )}
                >
                  <div className="flex flex-wrap gap-2">
                    {selectedBuyerIds.map((buyerId) => {
                      const buyer = buyerPickerCache[buyerId];
                      return (
                        <button
                          key={buyerId}
                          type="button"
                          onClick={() => onSelectedBuyerIdsChange(selectedBuyerIds.filter((id) => id !== buyerId))}
                          className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
                        >
                          <span>{buyer?.business_name ?? 'Selected buyer'}</span>
                          <span aria-hidden="true" className="text-teal-700">×</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex items-center px-1 py-1">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={allFilteredBuyerIds.length === 0}
                  onClick={() => {
                    for (const buyer of buyerPickerRows) {
                      cacheBuyerRow(buyer);
                    }
                    onSelectedBuyerIdsChange(
                      allFilteredSelected
                        ? selectedBuyerIds.filter((id) => !allFilteredBuyerIds.includes(id))
                        : Array.from(new Set([...selectedBuyerIds, ...allFilteredBuyerIds])),
                    );
                  }}
                >
                  {allFilteredSelected ? 'Clear Filtered' : 'Select Filtered'}
                </Button>
                {selectedBuyerIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectedBuyerIdsChange([])}
                  >
                    {clearSelectionLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pt-2">
            {isRefetchingResults ? (
              <BuyerResultsSkeleton />
            ) : buyerPickerQuery.isFetching && buyerPickerRows.length === 0 ? (
              <BuyerResultsSkeleton />
            ) : buyerPickerQuery.isError ? (
              <div className="px-4 py-12 text-center text-base text-danger-600">We couldn&apos;t load buyers right now.</div>
            ) : buyerPickerRows.length === 0 ? (
              <div className="px-4 py-12 text-center text-base text-cream-700">No buyers match the current search and filters.</div>
            ) : (
              <div className="space-y-0.5">
                {buyerPickerRows.map((buyer) => {
                  const checked = selectedBuyerSet.has(buyer.id);
                  return (
                    <button
                      key={buyer.id}
                      type="button"
                      onClick={() => toggleBuyerSelection(buyer)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-[10px] text-left transition-colors',
                        checked ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <EntityAvatar initials={buyer.avatar.initials} hue={buyer.avatar.hue} size={36} className="rounded-[10px]" />
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium text-cream-900">{buyer.business_name}</p>
                          <p className="mt-0.5 truncate text-sm text-cream-700">{formatBuyerSecondaryText(buyer)}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                        {checked ? 'Selected' : 'Add'}
                      </span>
                    </button>
                  );
                })}
                {buyerPickerQuery.hasNextPage ? <div ref={sentinelRef} className="h-4" /> : null}
                {buyerPickerQuery.isFetchingNextPage ? <BuyerResultsSkeleton /> : null}
              </div>
            )}
          </div>
        </SheetBody>
        <SheetFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply?.();
              onOpenChange(false);
            }}
          >
            <Check className="h-3.5 w-3.5" />
            {applyLabel ?? `Use ${selectedBuyerIds.length} buyers`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
