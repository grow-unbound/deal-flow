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
                  className="font-semibold uppercase text-[var(--cream-700)]"
                  style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em' }}
                >
                  {greetingLine}
                </p>
                <h1
                  className="mt-2 font-semibold leading-[0.95] text-[var(--cream-900)]"
                  style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page)', letterSpacing: '-0.025em' }}
                >
                  {title}
                </h1>
                {previewNote ? (
                  <p className="mt-2 max-w-[30rem] font-medium leading-6 tracking-[-0.01em] text-[var(--cream-500)]" style={{ fontSize: 'var(--b-text-body)' }}>
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
              className="truncate font-semibold tracking-[-0.015em] text-[var(--cream-900)]"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-header)' }}
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
