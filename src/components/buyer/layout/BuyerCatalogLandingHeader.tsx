'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchBar } from '@/components/buyer/catalog/SearchBar';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { buildBuyerSearchHref } from '@/lib/buyer-routes';

interface BuyerCatalogLandingHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
}

export function BuyerCatalogLandingHeader({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search products, SKU, brand…',
}: BuyerCatalogLandingHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();
  const router = useRouter();

  function handleSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    markBuyerNavigationForward();
    router.push(buildBuyerSearchHref({ scope: 'catalog', q }));
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
            <div className="flex items-start justify-between px-4 pb-2 pt-5">
              <div>
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-[var(--cream-500)]">
                  Browse
                </p>
                <h1
                  className="text-2xl font-bold leading-tight"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}
                >
                  Catalog
                </h1>
              </div>
              <button
                type="button"
                className="mt-1 flex h-9 w-9 items-center justify-center rounded-full"
                style={{ color: 'var(--cream-400)' }}
                aria-label="Help"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="px-4 pb-3 pt-1">
          <SearchBar value={searchValue} onChange={onSearchChange} placeholder={searchPlaceholder} />
        </form>
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
