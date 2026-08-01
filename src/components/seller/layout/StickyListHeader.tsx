import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StickyListHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Pins the title/KPI/filter block above the list column's scrollable body —
 * a `shrink-0` flex item (not `position: sticky`) so it never moves, however
 * the body beneath scrolls. Escapes `PageWrap`'s horizontal padding via
 * negative margins so the band's background spans full width, then re-applies
 * the same padding to its content so it stays visually aligned with the list
 * beneath it. No bottom padding — the FilterBar inside it is meant to sit
 * flush against the table/list body immediately below with zero gap.
 */
export function StickyListHeader({ children, className }: StickyListHeaderProps) {
  return (
    <div
      className={cn(
        'shrink-0 -mx-4 bg-[var(--bg-surface)] px-4 md:-mx-6 md:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
