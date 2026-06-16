'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BuyerSearchIconButton } from '@/components/buyer/layout/BuyerSearchIconButton';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';
import { markBuyerNavigationBack } from '@/hooks/useBuyerNavigationDirection';

export interface BuyerDetailShellProps {
  title: string;
  /** When set, show search pill linking to fullscreen search with these query params. */
  searchHref?: string;
  children: React.ReactNode;
}

export function BuyerDetailShell({ title, searchHref, children }: BuyerDetailShellProps) {
  const router = useRouter();
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();

  function handleBack(): void {
    markBuyerNavigationBack();
    router.back();
  }

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 backdrop-blur-md transition-shadow',
          collapsed && 'shadow-sm',
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--bg-surface)] text-[var(--fg-2)] active:bg-[var(--bg-recessed)]"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1
            className={cn(
              'min-w-0 flex-1 font-[var(--font-display)] font-bold text-[var(--fg-1)] leading-tight',
              collapsed ? 'text-base' : 'text-lg',
            )}
          >
            {title}
          </h1>
          {searchHref ? <BuyerSearchIconButton href={searchHref} /> : null}
        </div>
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      {children}
    </>
  );
}
