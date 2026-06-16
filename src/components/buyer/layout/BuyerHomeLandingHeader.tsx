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
            <div className="flex items-start justify-between px-[18px] pb-1 pt-[18px]">
              <div className="min-w-0 flex-1 pr-2">
                <p
                  className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--cream-600)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {greetingLine}
                </p>
                <h1
                  className="mt-0.5 text-xl font-bold leading-tight text-[var(--cream-900)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {title}
                </h1>
                {previewNote ? (
                  <p className="mt-1 text-xs text-[var(--cream-500)]">{previewNote}</p>
                ) : null}
              </div>
              {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>
          </div>
        </div>

        {collapsed ? (
          <div className="px-[18px] py-2">
            <p className="truncate text-sm font-semibold text-[var(--cream-900)]" style={{ fontFamily: 'var(--font-display)' }}>
              {title}
            </p>
          </div>
        ) : null}
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
