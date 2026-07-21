'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Search, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface SellerBrandPickerOption {
  id: string;
  label: string;
}

export function SellerBrandPickerOverlay({
  open,
  onOpenChange,
  title,
  brands,
  selectedBrandIds,
  onSelectedBrandIdsChange,
  onApply,
  clearSelectionLabel = 'Clear selection',
  applyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  brands: SellerBrandPickerOption[];
  selectedBrandIds: string[];
  onSelectedBrandIdsChange: (ids: string[]) => void;
  onApply?: () => void;
  clearSelectionLabel?: string;
  applyLabel?: string;
}) {
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedChipsExpanded, setSelectedChipsExpanded] = useState(false);

  const brandLabelById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand.label])),
    [brands],
  );

  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    if (!query) return brands;
    return brands.filter((brand) => brand.label.toLowerCase().includes(query));
  }, [brandSearch, brands]);

  const selectedBrandSet = useMemo(() => new Set(selectedBrandIds), [selectedBrandIds]);
  const filteredBrandIds = useMemo(() => filteredBrands.map((brand) => brand.id), [filteredBrands]);
  const allFilteredSelected =
    filteredBrandIds.length > 0 && filteredBrandIds.every((id) => selectedBrandSet.has(id));

  useEffect(() => {
    if (open) return;
    setBrandSearch('');
    setSelectedChipsExpanded(false);
  }, [open]);

  function toggleBrandSelection(brandId: string) {
    onSelectedBrandIdsChange(
      selectedBrandSet.has(brandId)
        ? selectedBrandIds.filter((id) => id !== brandId)
        : Array.from(new Set([...selectedBrandIds, brandId])),
    );
  }

  const applyButtonLabel =
    applyLabel ??
    (selectedBrandIds.length === 0
      ? 'Use all brands'
      : `Use ${selectedBrandIds.length} brand${selectedBrandIds.length === 1 ? '' : 's'}`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-[540px] flex-col p-0">
        <SheetHeader className="pr-12">
          <SheetTitle>{title}</SheetTitle>
          <div className="mt-2 flex items-center gap-2 text-sm text-cream-700">
            <Tag className="h-4 w-4 text-teal-700" />
            <span>
              {selectedBrandIds.length === 0
                ? 'All brands allowed'
                : `${selectedBrandIds.length} brand${selectedBrandIds.length === 1 ? '' : 's'} selected`}
            </span>
          </div>
        </SheetHeader>
        <SheetBody className="flex min-h-0 flex-1 flex-col space-y-0 overflow-hidden px-5 py-4">
          <div className="shrink-0 space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-600" />
              <Input
                value={brandSearch}
                onChange={(event) => setBrandSearch(event.target.value)}
                placeholder="Search brands"
                className="pl-9"
              />
            </div>

            {selectedBrandIds.length > 0 ? (
              <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Selected brands</p>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-800"
                    aria-label={selectedChipsExpanded ? 'Collapse selected brands' : 'Expand selected brands'}
                    onClick={() => setSelectedChipsExpanded((current) => !current)}
                  >
                    {selectedChipsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
                <div
                  className={cn(
                    'mt-2 overflow-hidden transition-[max-height] duration-200',
                    selectedChipsExpanded ? 'max-h-40 overflow-y-auto' : 'max-h-10',
                  )}
                >
                  <div className="flex flex-wrap gap-2">
                    {selectedBrandIds.map((brandId) => (
                      <button
                        key={brandId}
                        type="button"
                        onClick={() => toggleBrandSelection(brandId)}
                        className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100"
                      >
                        <span>{brandLabelById.get(brandId) ?? 'Brand'}</span>
                        <span aria-hidden="true" className="text-teal-700">×</span>
                      </button>
                    ))}
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
                  disabled={filteredBrandIds.length === 0}
                  onClick={() =>
                    onSelectedBrandIdsChange(
                      allFilteredSelected
                        ? selectedBrandIds.filter((id) => !filteredBrandIds.includes(id))
                        : Array.from(new Set([...selectedBrandIds, ...filteredBrandIds])),
                    )
                  }
                >
                  {allFilteredSelected ? 'Clear filtered' : 'Select filtered'}
                </Button>
                {selectedBrandIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectedBrandIdsChange([])}
                  >
                    {clearSelectionLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pt-2">
            {filteredBrands.length === 0 ? (
              <div className="px-4 py-12 text-center text-base text-cream-700">
                {brandSearch.trim() ? 'No brands match your search.' : 'No brands available.'}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredBrands.map((brand) => {
                  const checked = selectedBrandSet.has(brand.id);
                  return (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => toggleBrandSelection(brand.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-[10px] text-left transition-colors',
                        checked ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
                      )}
                    >
                      <p className="truncate text-base font-medium text-cream-900">{brand.label}</p>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
                        {checked ? 'Selected' : 'Add'}
                      </span>
                    </button>
                  );
                })}
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
            {applyButtonLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
