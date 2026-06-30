'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function useOutsideDismiss(
  openKey: string | null,
  setOpenKey: (value: string | null) => void,
  extraRef?: React.RefObject<HTMLElement | null>,
) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!ref.current || !openKey) return;
      const target = event.target as Node | null;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const clickedInsideRoot = target ? ref.current.contains(target) : false;
      const clickedInsideExtra = target ? (extraRef?.current?.contains(target) ?? false) : false;
      const clickedInsidePath = path.some((node) => node === ref.current || node === extraRef?.current);
      if (!clickedInsideRoot && !clickedInsideExtra && !clickedInsidePath) {
        setOpenKey(null);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (!ref.current || !openKey) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (ref.current.contains(target) || extraRef?.current?.contains(target)) return;
      setOpenKey(null);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [extraRef, openKey, setOpenKey]);

  return ref;
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
  const triggerRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = useOutsideDismiss(openKey, setOpenKey, panelRef);
  const [panelPosition, setPanelPosition] = React.useState<MenuPosition | null>(null);

  const updatePanelPosition = React.useCallback(() => {
    if (!openKey) {
      setPanelPosition(null);
      return;
    }

    const trigger = triggerRefs.current.get(openKey);
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const width = rect.width;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - width - viewportPadding),
    );
    const top = rect.bottom + 2;
    const maxHeight = Math.max(180, window.innerHeight - top - viewportPadding);

    setPanelPosition({ top, left, width, maxHeight });
  }, [openKey]);

  React.useLayoutEffect(() => {
    if (!openKey) {
      setPanelPosition(null);
      return;
    }

    updatePanelPosition();

    const handleReposition = () => updatePanelPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [openKey, updatePanelPosition]);

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
  const openGroup = activeGroups.find((group) => group.key === openKey) ?? null;

  return (
    <section
      ref={rootRef}
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
              <div key={group.key} className="relative shrink-0">
                <button
                  ref={(node) => {
                    triggerRefs.current.set(group.key, node);
                  }}
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : group.key)}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm text-cream-800 transition-colors hover:bg-cream-100',
                    'border-cream-400 bg-white',
                    group.values.length > 0 && 'border-ember-300 bg-ember-50 text-cream-900',
                    isOpen && 'border-ember-300 bg-ember-50',
                  )}
                  >
                  <span className="font-medium">{triggerLabel}</span>
                  <ChevronDown size={14} />
                </button>
              </div>
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

      {openGroup && panelPosition
        ? createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="fixed z-[70] overflow-hidden rounded-[10px] border border-cream-300 bg-white shadow-lg"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
              maxHeight: panelPosition.maxHeight,
            }}
          >
            <div className="max-h-full overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => {
                  openGroup.onChange([]);
                  setOpenKey(null);
                }}
                className={cn(
                  'flex w-full items-center rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-cream-50',
                  openGroup.values.length === 0 && 'font-medium text-cream-900',
                )}
              >
                All
              </button>
              {openGroup.options.map((option) => {
                const checked = openGroup.values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() =>
                      {
                        openGroup.onChange([option.value]);
                        setOpenKey(null);
                      }
                    }
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
          </div>,
          document.body,
        )
        : null}
    </section>
  );
}
