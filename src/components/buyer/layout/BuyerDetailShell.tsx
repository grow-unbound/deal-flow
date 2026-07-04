'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BuyerLocationControl } from '@/components/buyer/layout/BuyerLocationControl';
import { BuyerSearchIconButton } from '@/components/buyer/layout/BuyerSearchIconButton';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';
import { markBuyerNavigationBack } from '@/hooks/useBuyerNavigationDirection';

export interface BuyerDetailShellProps {
  title: React.ReactNode;
  /** When set, show search pill linking to fullscreen search with these query params. */
  searchHref?: string;
  /** Optional right-aligned content in the main title row. */
  rightSlot?: React.ReactNode;
  /** Optional row shown below the title row. */
  subtitle?: React.ReactNode;
  /** Hide the buyer location control for detail screens. */
  showLocationControl?: boolean;
  children: React.ReactNode;
}

export function BuyerDetailShell({
  title,
  searchHref,
  rightSlot,
  subtitle,
  showLocationControl,
  children,
}: BuyerDetailShellProps) {
  const router = useRouter();
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();

  function handleBack(): void {
    markBuyerNavigationBack();
    router.back();
  }

  return (
    <>
      <header
        className={cn('sticky top-0 z-[15] transition-shadow', collapsed && 'shadow-sm')}
        style={{
          borderBottom: '1px solid rgba(212, 204, 192, 0.6)',
          background: 'rgba(250, 247, 242, 0.92)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div className="flex items-start gap-2 px-3 pt-2.5">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[var(--fg-2)]"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h1
                className="min-w-0 flex-1 font-semibold text-[var(--fg-1)] leading-tight"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--b-text-header)',
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h1>
              {rightSlot ? <div className="shrink-0 pt-0.5">{rightSlot}</div> : null}
            </div>
            {subtitle ? <div className="mt-1">{subtitle}</div> : null}
          </div>
          {showLocationControl ? <BuyerLocationControl /> : null}
          {searchHref ? <BuyerSearchIconButton href={searchHref} /> : null}
        </div>
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      {children}
    </>
  );
}
