'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';

interface BuyerStickyPageHeaderProps {
  eyebrow: string;
  title: string;
  /** Shown in the compact sticky bar when scrolled (defaults to `title`). */
  collapsedTitle?: string;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
}

export function BuyerStickyPageHeader({
  eyebrow,
  title,
  collapsedTitle,
  rightSlot,
  children,
}: BuyerStickyPageHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();
  const compact = collapsedTitle ?? title;

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 backdrop-blur-md',
          collapsed && 'shadow-sm',
        )}
      >
        <div className="flex items-start justify-between px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1 pr-2">
            {!collapsed ? (
              <p
                className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--cream-700)]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                'font-[var(--font-display)] font-extrabold text-[var(--cream-900)] leading-tight tracking-tight',
                collapsed ? 'mt-0 text-base' : 'mt-0.5 text-2xl sm:text-3xl',
              )}
              style={{ letterSpacing: collapsed ? '0' : '-0.02em' }}
            >
              {collapsed ? compact : title}
            </h1>
            {!collapsed && children ? <div className="mt-1.5">{children}</div> : null}
          </div>
          {!collapsed && rightSlot ? <div className="shrink-0 pt-1">{rightSlot}</div> : null}
        </div>
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
    </>
  );
}
