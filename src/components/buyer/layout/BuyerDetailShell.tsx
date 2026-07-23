'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BuyerLocationControl } from '@/components/buyer/layout/BuyerLocationControl';
import { BuyerSearchIconButton } from '@/components/buyer/layout/BuyerSearchIconButton';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';
import { buildBuyerSearchHref } from '@/lib/buyer-routes';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';

export interface BuyerDetailShellProps {
  title: React.ReactNode;
  /** When set, show search pill linking to fullscreen search with these query params. */
  searchHref?: string;
  /** Optional right-aligned content in the main title row. */
  rightSlot?: React.ReactNode;
  /** Optional row shown below the title row. */
  subtitle?: React.ReactNode;
  /** Optional full-width control row shown below the title row. */
  headerSearch?: React.ReactNode;
  /** Sticky chip/filter row pinned below title row inside the header. */
  stickyToolbar?: React.ReactNode;
  /** Hide the buyer location control for detail screens. */
  showLocationControl?: boolean;
  /** Hide the search icon in the header row. */
  hideSearch?: boolean;
  children: React.ReactNode;
}

export function BuyerDetailShell({
  title,
  searchHref = buildBuyerSearchHref({}),
  rightSlot,
  subtitle,
  headerSearch,
  stickyToolbar,
  showLocationControl = false,
  hideSearch = false,
  children,
}: BuyerDetailShellProps) {
  const router = useRouter();
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();

  function handleBack(): void {
    navigateBuyerBack(router);
  }

  return (
    <>
      <header
        className={cn('sticky top-0 z-[15] transition-shadow', collapsed && 'shadow-sm')}
        style={{
          borderBottom: '1px solid rgba(212, 204, 192, 0.6)',
          background: 'var(--bg-base)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-3',
            subtitle ? 'min-h-16 py-2.5' : 'min-h-14 py-2',
          )}
        >
          <button
            type="button"
            onClick={handleBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] p-0 text-[var(--fg-2)] transition-colors active:bg-[var(--cream-100)]"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1
                className="min-w-0 flex-1 truncate font-semibold text-[var(--fg-1)] leading-tight"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--b-text-header)',
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h1>
              {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>
            {subtitle ? <div className="mt-0.5">{subtitle}</div> : null}
          </div>
          {showLocationControl ? <BuyerLocationControl /> : null}
          {hideSearch ? null : <BuyerSearchIconButton href={searchHref} />}
        </div>
        {headerSearch ? (
          <div className="border-t border-[var(--border-1)] bg-[var(--bg-base)] px-4 py-2.5">
            {headerSearch}
          </div>
        ) : null}
        {stickyToolbar ? (
          <div className="border-t border-[var(--border-1)] bg-[var(--bg-base)] pb-2 pt-1">
            {stickyToolbar}
          </div>
        ) : null}
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      <div className="pt-3">{children}</div>
    </>
  );
}
