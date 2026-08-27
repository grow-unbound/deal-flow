'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BuyerPickerRow } from '@/components/seller/shared/BuyerPickerRow';
import { PickerFiltersPanel } from '@/components/seller/shared/PickerFiltersPanel';
import { SelectedItemsChipsPanel } from '@/components/seller/shared/SelectedItemsChipsPanel';
import { SelectAllCheckbox } from '@/components/seller/shared/SelectableMembershipTable';
import { useCohortComposerBuyers, type CohortComposerBuyer } from '@/hooks/useCohorts';
import { useTenantLocationOptions } from '@/hooks/useLocations';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useStickyPickerHeader } from '@/hooks/useStickyPickerHeader';
import { usePickerSelection, getLoadedSelectionState } from '@/hooks/usePickerSelection';
import { usePickerFilterState } from '@/hooks/usePickerFilterState';
import { BUYER_ADVANCED_FILTERS, BUYER_QUICK_ADVANCED_LINKS, BUYER_QUICK_FILTERS } from '@/lib/picker-filters';
import { cn } from '@/lib/utils';

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

/**
 * Shared buyer-picker Sheet used by CatalogComposer. Rewired onto the same shared buyer
 * RPC/hooks/components (useCohortComposerBuyers, BuyerPickerRow) used by the CustomerGroup,
 * Campaign, and PriceList buyer pickers — no more separate city/cohort/last-order/GMV filter
 * set or bespoke data path.
 */
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
  const debouncedBuyerSearch = useDebounce(buyerSearch, 300);
  const filterState = usePickerFilterState(BUYER_QUICK_ADVANCED_LINKS);
  const { data: locationOptions = [] } = useTenantLocationOptions(open);
  const advancedFilters = useMemo(
    () => [
      ...BUYER_ADVANCED_FILTERS,
      { key: 'sales_location', label: 'Sales location', options: locationOptions.map((loc) => ({ value: loc.id, label: loc.label })) },
    ],
    [locationOptions],
  );
  const { collapsed, handleScroll, reset } = useStickyPickerHeader();

  const buyerPickerQuery = useCohortComposerBuyers({
    query: debouncedBuyerSearch,
    selectedIds: selectedBuyerIds,
    limit: 30,
    enabled: open,
    quickFilters: filterState.quickFilters as any,
    status: (filterState.advancedValues.status ?? null) as any,
    buyerAppFilter: (filterState.advancedValues.buyer_app ?? null) as any,
    outstandingFilter: (filterState.advancedValues.outstanding ?? null) as any,
    locationId: filterState.advancedValues.sales_location ?? null,
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
  const selectedBuyerRows = useMemo(
    () => buyerPickerQuery.data?.pages.flatMap((page) => page.selected_buyers ?? []) ?? [],
    [buyerPickerQuery.data?.pages],
  );
  const [buyerPickerCache, setBuyerPickerCache] = useState<Record<string, CohortComposerBuyer>>({});
  const isRefetchingResults = buyerPickerQuery.isFetching
    && !buyerPickerQuery.isFetchingNextPage
    && buyerPickerQuery.isPlaceholderData;

  useEffect(() => {
    if (!buyerPickerQuery.data) return;
    setBuyerPickerCache((current) => {
      const next = { ...current };
      for (const buyer of [...buyerPickerRows, ...selectedBuyerRows]) {
        next[buyer.id] = buyer;
      }
      return next;
    });
  }, [buyerPickerQuery.data, buyerPickerRows, selectedBuyerRows]);

  useEffect(() => {
    if (open) {
      reset();
      return;
    }
    setBuyerSearch('');
    filterState.reset();
  }, [open, reset, filterState.reset]);

  const selection = usePickerSelection(selectedBuyerIds, onSelectedBuyerIdsChange);
  const selectedBuyerSet = selection.selectedSet;
  const loadedState = getLoadedSelectionState(buyerPickerRows.map((b) => b.id), selectedBuyerSet);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-[540px] flex-col p-0">
        <SheetHeader className={cn('pr-12', collapsed && 'pb-2')}>
          <SheetTitle>{title}</SheetTitle>
          {!collapsed ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-cream-700">
              <span>{selectedBuyerIds.length} buyers selected</span>
            </div>
          ) : null}
        </SheetHeader>
        <div className="shrink-0 space-y-3 border-b border-cream-300 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
            <Input
              value={buyerSearch}
              onChange={(event) => setBuyerSearch(event.target.value)}
              placeholder="Search buyer, phone, or city"
              className="pl-9"
            />
          </div>
          <SelectedItemsChipsPanel
            label="Selected buyers"
            items={selectedBuyerIds.map((buyerId) => ({
              id: buyerId,
              label: buyerPickerCache[buyerId]?.business_name ?? 'Selected buyer',
            }))}
            onRemove={(buyerId) => onSelectedBuyerIdsChange(selectedBuyerIds.filter((id) => id !== buyerId))}
          />
        </div>
        <div
          className={cn(
            'shrink-0 overflow-hidden border-b border-cream-300 px-5 transition-[max-height,opacity] duration-200 ease-standard',
            collapsed ? 'max-h-0 border-b-0 py-0 opacity-0' : 'max-h-[600px] py-3 opacity-100',
          )}
        >
          <div className="space-y-3">
            <PickerFiltersPanel
              quickFilters={BUYER_QUICK_FILTERS}
              activeQuickFilters={filterState.quickFilters}
              onToggleQuickFilter={filterState.toggleQuickFilter}
              advancedFilters={advancedFilters}
              advancedValues={filterState.advancedValues}
              onAdvancedChange={filterState.setAdvancedFilter}
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-cream-700">
                <SelectAllCheckbox
                  checked={loadedState.allLoadedSelected}
                  indeterminate={loadedState.someLoadedSelected}
                  onChange={() => selection.toggleAllLoaded(buyerPickerRows.map((b) => b.id))}
                  label="Select all loaded buyers"
                />
                Select all
              </label>
              {selectedBuyerIds.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={selection.clearAll}>
                  {clearSelectionLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <SheetBody onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
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
              {buyerPickerRows.map((buyer) => (
                <BuyerPickerRow
                  key={buyer.id}
                  buyer={buyer}
                  selected={selectedBuyerSet.has(buyer.id)}
                  onClick={() => selection.toggleOne(buyer.id)}
                />
              ))}
              {buyerPickerQuery.hasNextPage ? <div ref={sentinelRef} className="h-4" /> : null}
              {buyerPickerQuery.isFetchingNextPage ? <BuyerResultsSkeleton /> : null}
            </div>
          )}
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
