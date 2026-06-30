'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SearchBar } from '@/components/buyer/catalog/SearchBar';
import { BuyerLocationRow } from '@/components/buyer/layout/BuyerLocationRow';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';
import { buildBuyerSearchHref, type BuyerSearchHrefParams } from '@/lib/buyer-routes';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';

interface BuyerLandingHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Passed as `scope` when opening fullscreen search (Enter). Default `catalog`. */
  searchScope?: string;
  /** Extra search query params (e.g. `campaign_id`) merged when submitting search. */
  searchExtraParams?: Omit<BuyerSearchHrefParams, 'scope' | 'q'>;
  /** Category chips row — only when expanded (Catalog). */
  showCategoryChips?: boolean;
  categoryChips?: React.ReactNode;
  /** Catalog omits profile per design; Buy Again shows it. */
  showProfile?: boolean;
}

export function BuyerLandingHeader({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search products, SKU, brand…',
  searchScope = 'catalog',
  searchExtraParams,
  showCategoryChips = false,
  categoryChips = null,
  showProfile = false,
}: BuyerLandingHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();
  const router = useRouter();

  function handleSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    markBuyerNavigationForward();
    router.push(
      buildBuyerSearchHref({
        scope: searchScope,
        q,
        ...searchExtraParams,
      }),
    );
  }

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)]/95 backdrop-blur-md transition-shadow',
          collapsed && 'shadow-sm',
        )}
      >
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <div className="overflow-hidden">
            <BuyerLocationRow />
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className={cn('flex items-start gap-2 px-4 pb-3 pt-2', !showProfile && 'pr-4')}>
          <div className="min-w-0 flex-1">
            <SearchBar value={searchValue} onChange={onSearchChange} placeholder={searchPlaceholder} />
          </div>
          {showProfile ? (
            <Link
              href="/buy/profile"
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] text-[var(--fg-2)]',
                'hover:bg-[var(--bg-recessed)] transition-colors',
              )}
              aria-label="Profile"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          ) : null}
        </form>

        {showCategoryChips && !collapsed ? (
          <div className="border-t border-[var(--border-1)] bg-[var(--bg-base)] px-0 pb-2 pt-1">{categoryChips}</div>
        ) : null}
      </header>

      {/* When this leaves the scrollport, header collapses (location hidden) */}
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
