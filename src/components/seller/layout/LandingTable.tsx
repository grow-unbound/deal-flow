import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

import { ScrollableTableShell } from '@/components/seller/layout/ScrollableTableShell';

interface LandingTableColumn {
  label?: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  className?: string;
}

interface LandingTableProps {
  columns: LandingTableColumn[];
  children: ReactNode;
  className?: string;
  /** Merged onto `<table>` (e.g. `v2-table` from design system). */
  tableClassName?: string;
  /** Optional minimum table width so the shell scrolls instead of compressing columns. */
  tableMinWidth?: number | string;
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
  tableMinWidth,
  showEmptyState,
  emptyState,
}: LandingTableProps) {
  const hasHeader = columns.some((column) => column.label != null && column.label !== '');

  return (
    <ScrollableTableShell
      className={cn('rounded-b-[14px] border border-cream-300 border-t-0 bg-white', className)}
    >
      <table
        className={cn('landing-table w-full min-w-[960px] table-fixed border-collapse text-base', tableClassName)}
        style={tableMinWidth != null ? { minWidth: tableMinWidth } : undefined}
      >
        {hasHeader ? (
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
                  style={{
                    width: column.width,
                    minWidth: column.minWidth,
                    maxWidth: column.maxWidth,
                  }}
                >
                  {column.label ?? ''}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
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
