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
  // overflow-y-visible counters a CSS quirk: setting only overflow-x forces the
  // used value of overflow-y to `auto` too, which would make this div its own
  // scroll container and break `position: sticky` on the table header (it needs
  // to stick relative to the page's actual vertical scroll container, not this
  // horizontal-only one).
  return <div className={cn('w-full overflow-x-auto overflow-y-visible', className)}>{children}</div>;
}
