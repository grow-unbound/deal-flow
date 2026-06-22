'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';

interface BuyerHomeLandingHeaderProps {
  greetingLine: string;
  title: string;
  previewNote?: string | null;
  rightSlot?: React.ReactNode;
}

export function BuyerHomeLandingHeader({
  greetingLine,
  title,
  previewNote,
  rightSlot,
}: BuyerHomeLandingHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-transparent bg-[var(--bg-base)]/95 backdrop-blur-md transition-shadow',
          collapsed && 'border-[var(--border-1)] shadow-sm',
        )}
      >
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-start justify-between px-5 pb-2 pt-6">
              <div className="min-w-0 flex-1 pr-4">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cream-500)]"
                >
                  {greetingLine}
                </p>
                <h1
                  className="mt-2 text-[var(--yk-text-3xl)] font-extrabold leading-[0.95] tracking-[-0.025em] text-[var(--cream-900)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {title}
                </h1>
                {previewNote ? (
                  <p className="mt-2 max-w-[30rem] text-[var(--yk-text-base)] font-medium leading-6 tracking-[-0.01em] text-[var(--cream-500)]">
                    {previewNote}
                  </p>
                ) : null}
              </div>
              {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>
          </div>
        </div>

        {collapsed ? (
          <div className="px-5 py-3">
            <p
              className="truncate text-[var(--yk-text-lg)] font-bold tracking-[-0.02em] text-[var(--cream-900)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {title}
            </p>
          </div>
        ) : null}
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
