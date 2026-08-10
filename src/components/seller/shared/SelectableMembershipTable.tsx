'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function useSelectableRows<T>(
  rows: T[],
  getId: (row: T) => string,
) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visibleIds = useMemo(() => rows.map(getId), [getId, rows]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someSelected = visibleIds.some((id) => selectedIds.includes(id)) && !allSelected;

  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }, []);
  const toggleVisible = useCallback(() => {
    setSelectedIds((current) => {
      if (allSelected) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }, [allSelected, visibleIds]);

  return { selectedIds, setSelectedIds, clearSelection, toggleRow, toggleVisible, allSelected, someSelected };
}

export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label = 'Select visible rows',
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={indeterminate ? 'data-[state=unchecked]:bg-cream-300' : ''}
    />
  );
}

export function RowSelectCheckbox({
  checked,
  onChange,
  label = 'Select row',
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return <Checkbox checked={checked} onCheckedChange={onChange} aria-label={label} />;
}

export function MembershipBulkActionBar({
  selectedCount,
  onClear,
  onInclude,
  onRemove,
  isPending,
}: {
  selectedCount: number;
  onClear: () => void;
  onInclude?: () => void;
  onRemove?: () => void;
  isPending?: boolean;
}) {
  if (selectedCount <= 0) return null;

  const announceDeferred = () => {
    toast.info('Membership updates will be connected in a later pass.');
  };

  return (
    <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-teal-200 bg-teal-50 px-4 py-2.5">
      <span className="text-sm font-medium text-teal-800">{selectedCount} selected</span>
      <div className="h-4 w-px bg-teal-200" />
      <Button type="button" size="sm" disabled={isPending} onClick={onInclude ?? announceDeferred}>
        Include selected
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onRemove ?? announceDeferred}>
        Remove selected
      </Button>
      <button
        type="button"
        className="ml-auto text-sm text-teal-600 hover:text-teal-900"
        onClick={onClear}
      >
        Clear selection
      </button>
    </div>
  );
}

export function MemberToggle({
  checked,
  label,
  disabled = true,
  disabledReason,
  isPending,
  onChange,
}: {
  checked: boolean;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  isPending?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const switchLabel = label ?? (checked ? 'Member yes' : 'Member no');
  return (
    <div className="flex items-center gap-2.5" title={disabled ? disabledReason : undefined}>
      <Switch
        checked={checked}
        disabled={disabled || isPending}
        aria-label={switchLabel}
        onCheckedChange={onChange}
      />
      <span className="text-sm font-medium text-cream-700">{checked ? 'Yes' : 'No'}</span>
    </div>
  );
}

export function SelectableRow({
  selected,
  children,
}: {
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <tr
      className={cn(
        'border-b border-cream-300 transition-colors',
        selected ? 'bg-teal-50/50' : 'bg-white hover:bg-cream-50',
      )}
    >
      {children}
    </tr>
  );
}

export function TableBodySkeleton({
  rows = 7,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={`skeleton-${rowIndex}`} className="border-b border-cream-200 bg-white">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={`skeleton-${rowIndex}-${columnIndex}`} className="px-3 py-3">
              <Skeleton className={cn('h-4 rounded-md', columnIndex === 1 ? 'w-4/5' : 'w-full')} />
              {columnIndex === 1 ? <Skeleton className="mt-2 h-3 w-1/2 rounded-md" /> : null}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ProductImageCell({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  return (
    <div className="relative h-10 w-10 overflow-hidden rounded-[8px] border border-cream-300 bg-cream-100">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="40px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-cream-600">
          {alt.slice(0, 2)}
        </div>
      )}
    </div>
  );
}
