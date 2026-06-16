'use client';

import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { ScrollableTableShell } from '@/components/seller/layout/ScrollableTableShell';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  accessor?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

function DataTable<T extends { id: string }>({
  data,
  columns,
  loading,
  emptyMessage = 'No results found.',
  selectable,
  selectedIds = [],
  onSelectionChange,
  sortKey,
  sortDir,
  onSort,
  currentPage,
  totalPages,
  onPageChange,
  className,
}: DataTableProps<T>) {
  const allSelected = data.length > 0 && data.every((row) => selectedIds.includes(row.id));
  const someSelected = data.some((row) => selectedIds.includes(row.id)) && !allSelected;

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !data.some((r) => r.id === id)));
    } else {
      onSelectionChange([...new Set([...selectedIds, ...data.map((r) => r.id)])]);
    }
  }

  function toggleRow(id: string) {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <ScrollableTableShell className="rounded-lg border border-cream-200 shadow-xs">
        <table className="w-full min-w-max border-collapse text-base text-cream-900">
          <thead>
            <tr className="border-b border-cream-200 bg-cream-100">
              {selectable && (
                <th className="w-10 pl-4 pr-2 py-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                    className={someSelected ? 'data-[state=unchecked]:bg-cream-300' : ''}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  style={{ width: col.width }}
                  className={cn(
                    'table-label px-4 py-3 text-left whitespace-nowrap text-cream-700',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.sortable && 'cursor-pointer select-none hover:text-cream-900 transition-colors'
                  )}
                  onClick={col.sortable && onSort ? () => onSort(String(col.key)) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <SortIcon active={sortKey === col.key} dir={sortDir} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="p-4"
                >
                  <div className="space-y-3" aria-label="Loading table rows">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-10 w-full rounded-lg" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="py-16 text-center text-cream-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-cream-100 hover:bg-cream-50 transition-colors duration-fast',
                    selectedIds.includes(row.id) && 'bg-teal-50/50',
                    i === data.length - 1 && 'border-b-0'
                  )}
                >
                  {selectable && (
                    <td className="pl-4 pr-2 py-3">
                      <Checkbox
                        checked={selectedIds.includes(row.id)}
                        onCheckedChange={() => toggleRow(row.id)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={cn(
                        'px-4 py-3',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right'
                      )}
                    >
                      {col.accessor
                        ? col.accessor(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollableTableShell>

      {totalPages && totalPages > 1 && onPageChange && currentPage && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-caption text-cream-500">
            Page {currentPage} of {totalPages}
          </p>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-teal-500" />
    : <ChevronDown className="h-3 w-3 text-teal-500" />;
}

export { DataTable };
