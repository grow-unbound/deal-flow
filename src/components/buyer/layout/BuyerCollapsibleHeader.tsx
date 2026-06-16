'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';

interface BuyerCollapsibleHeaderProps {
  children: (ctx: { collapsed: boolean }) => React.ReactNode;
  className?: string;
}

/**
 * Sticky header + scroll sentinel; `collapsed` becomes true when the user scrolls past the sentinel.
 */
export function BuyerCollapsibleHeader({ children, className }: BuyerCollapsibleHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 backdrop-blur-md transition-shadow',
          collapsed && 'shadow-sm',
          className,
        )}
      >
        {children({ collapsed })}
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
