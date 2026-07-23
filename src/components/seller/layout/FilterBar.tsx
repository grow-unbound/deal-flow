'use client';

import * as React from 'react';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type FilterValue = string;

export interface FilterBarOption {
  value: FilterValue;
  label: string;
  disabled?: boolean;
}

export interface FilterBarGroup {
  key: string;
  label: string;
  options: FilterBarOption[];
  values: FilterValue[];
  onChange: (values: FilterValue[]) => void;
}

interface LegacyFilterBarProps {
  count: string;
  searchPlaceholder: string;
  chips: string[];
  activeChip: string;
  sortBy: string;
  hideViewToggle: boolean;
  searchValue?: string;
  searchLoading?: boolean;
  onSearchChange?: (value: string) => void;
  onChipChange?: (chip: string) => void;
  sortOptions?: string[];
  onSortChange?: (option: string) => void;
}

interface FilterBarProps extends LegacyFilterBarProps {
  groups?: FilterBarGroup[];
}

function describeSelection(group: FilterBarGroup): string {
  if (group.values.length === 0) return 'All';
  if (group.values.length === 1) {
    return group.options.find((option) => option.value === group.values[0])?.label ?? group.values[0];
  }

  const labels = group.values
    .map((value) => group.options.find((option) => option.value === value)?.label ?? value)
    .filter(Boolean);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function normalizeLegacyGroups(props: LegacyFilterBarProps): FilterBarGroup[] {
  const allLabel = props.chips[0] ?? 'All';
  return [
    {
      key: 'legacy-filter',
      label: 'Filter',
      options: props.chips.map((chip) => ({ value: chip, label: chip })),
      values: props.activeChip && props.activeChip !== allLabel ? [props.activeChip] : [],
      onChange: (values) => props.onChipChange?.(values[0] ?? allLabel),
    },
  ];
}

export function FilterBar({
  count,
  searchPlaceholder,
  chips,
  activeChip,
  sortBy,
  hideViewToggle,
  searchValue,
  searchLoading,
  onSearchChange,
  onChipChange,
  sortOptions,
  onSortChange,
  groups,
}: FilterBarProps) {
  const activeGroups = groups ?? normalizeLegacyGroups({
    count,
    searchPlaceholder,
    chips,
    activeChip,
    sortBy,
    hideViewToggle,
    searchValue,
    onSearchChange,
    onChipChange,
    sortOptions,
    onSortChange,
  });

  const [openKey, setOpenKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (openKey && !activeGroups.some((group) => group.key === openKey)) {
      setOpenKey(null);
    }
  }, [activeGroups, openKey]);

  const clearAllFilters = React.useCallback(() => {
    activeGroups.forEach((group) => group.onChange([]));
    setOpenKey(null);
  }, [activeGroups]);
  const allSelected = activeGroups.every((group) => group.values.length === 0);

  return (
    <section
      className="mt-5 rounded-t-[14px] border border-cream-300 border-b-0 bg-cream-50 px-3 py-[10px]"
    >
      <div className="flex w-full flex-nowrap items-center gap-2 overflow-visible">
        <div className="relative inline-flex h-9 min-w-[176px] flex-[0_1_220px] items-center gap-2 rounded-[10px] border border-cream-300 bg-white px-[10px] pr-8 text-cream-700">
          <Search size={14} className="pointer-events-none text-cream-600" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-cream-900 placeholder:text-cream-600 focus:outline-none focus:ring-0"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
          {searchLoading ? (
            <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-cream-500" aria-hidden />
          ) : searchValue?.length ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange?.('')}
              className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-cream-500 transition-colors hover:bg-cream-100 hover:text-cream-800"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={clearAllFilters}
            className={cn(
              'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm transition-colors',
              'border-cream-400 bg-white text-cream-800 hover:bg-cream-100',
              allSelected && 'border-ember-200 bg-ember-50 text-cream-900 hover:bg-ember-50',
            )}
          >
            All
          </button>
          {activeGroups.map((group) => {
            const isOpen = openKey === group.key;
            const triggerLabel = group.label ? `${group.label}: ${describeSelection(group)}` : describeSelection(group);
            return (
              <Popover
                key={group.key}
                open={isOpen}
                onOpenChange={(nextOpen) => setOpenKey(nextOpen ? group.key : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm text-cream-800 transition-colors hover:bg-cream-100',
                      'border-cream-400 bg-white',
                      group.values.length > 0 && 'border-ember-300 bg-ember-50 text-cream-900',
                      isOpen && 'border-ember-300 bg-ember-50',
                    )}
                  >
                    <span className="font-medium">{triggerLabel}</span>
                    <ChevronDown size={14} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={2}
                  className="z-[70] w-[var(--radix-popover-trigger-width)] max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-hidden rounded-[10px] border-cream-300 bg-white p-1 shadow-lg"
                >
                  <div className="max-h-full overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        group.onChange([]);
                        setOpenKey(null);
                      }}
                      className={cn(
                        'flex w-full items-center rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-cream-50',
                        group.values.length === 0 && 'font-medium text-cream-900',
                      )}
                    >
                      All
                    </button>
                    {group.options.map((option) => {
                      const checked = group.values.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={option.disabled}
                          onClick={() => {
                            group.onChange([option.value]);
                            setOpenKey(null);
                          }}
                          className={cn(
                            'flex w-full items-center rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-cream-50',
                            option.disabled && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <span className={cn('min-w-0 flex-1', checked && 'font-medium text-cream-900')}>
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        <div className="hidden shrink-0 justify-center xl:flex">
          <p className="whitespace-nowrap text-sm text-cream-700">{count}</p>
        </div>

        {sortOptions ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-cream-400 bg-white px-3 text-sm text-cream-800 hover:bg-cream-100">
              <span className="text-cream-700">Sort</span>
              <span className="font-semibold">{sortBy}</span>
              <ChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px] border-cream-300">
              {sortOptions.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => onSortChange?.(option)}
                  className={cn(option === sortBy && 'bg-cream-100 font-medium text-cream-900')}
                >
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {!hideViewToggle ? (
          <button type="button" className="hidden h-9 shrink-0 rounded-md border border-cream-200 px-2 text-sm text-cream-700 xl:inline-flex">
            View
          </button>
        ) : null}
      </div>
    </section>
  );
}
