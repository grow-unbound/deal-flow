import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

import { ScrollableTableShell } from '@/components/seller/layout/ScrollableTableShell';

interface LandingTableColumn {
  label?: string;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  className?: string;
}

interface LandingTableProps {
  columns: LandingTableColumn[];
  children: ReactNode;
  className?: string;
  /** Merged onto `<table>` (e.g. `v2-table` from design system). */
  tableClassName?: string;
  /** When true, render `emptyState` as the sole body row instead of `children`. */
  showEmptyState?: boolean;
  /** Shown when `showEmptyState` is true (e.g. `<EmptyState ... />`). */
  emptyState?: ReactNode;
}

export function LandingTable({
  columns,
  children,
  className,
  tableClassName,
  showEmptyState,
  emptyState,
}: LandingTableProps) {
  return (
    <ScrollableTableShell
      className={cn('rounded-b-[14px] border border-cream-300 border-t-0 bg-white', className)}
    >
      <table className={cn('w-full min-w-max border-collapse text-base', tableClassName)}>
        <thead>
          <tr className="border-y border-cream-300 bg-white">
            {columns.map((column, index) => (
              <th
                key={`${column.label ?? 'col'}-${index}`}
                className={cn(
                  'table-label px-4 py-[11px] text-left text-cream-700',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                  column.className
                )}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.label ?? ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showEmptyState && emptyState ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)} className="p-0">
                {emptyState}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </ScrollableTableShell>
  );
}
