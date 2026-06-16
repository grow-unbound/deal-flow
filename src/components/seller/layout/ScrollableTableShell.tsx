import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ScrollableTableShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Full-width horizontal scroll container for data tables.
 * Pair inner `<table>` with `w-full min-w-max` (or `table-fixed` + colgroup for composer-style layouts).
 */
export function ScrollableTableShell({ children, className }: ScrollableTableShellProps) {
  return <div className={cn('w-full overflow-x-auto', className)}>{children}</div>;
}
