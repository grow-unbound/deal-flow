'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { BuyerCatalogLocationLink } from '@/components/buyer/layout/BuyerCatalogLocationLink';
import { BuyerCatalogSearchInput } from '@/components/buyer/layout/BuyerCatalogSearchInput';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';

interface BuyerCatalogLandingHeaderProps {
  categoryChips?: React.ReactNode;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export function BuyerCatalogLandingHeader({
  categoryChips = null,
  searchPlaceholder = 'Search products, SKU, brand…',
  searchValue,
  onSearchChange,
}: BuyerCatalogLandingHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)] transition-shadow',
          collapsed && 'shadow-sm',
        )}
        style={{ backgroundColor: 'var(--bg-base)', isolation: 'isolate' }}
      >
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-6">
              <div className="min-w-0 shrink-0">
                <p
                  className="font-semibold uppercase text-[var(--cream-700)]"
                  style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.18em' }}
                >
                  Browse
                </p>
                <h1
                  className="mt-1.5 font-semibold leading-[0.96] text-[var(--cream-900)]"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--b-text-page-sm)',
                    letterSpacing: '-0.022em',
                  }}
                >
                  Catalog
                </h1>
              </div>
              <BuyerCatalogLocationLink className="max-w-[58%] pt-0.5" />
            </div>
          </div>
        </div>

        <div className={cn('px-4 pb-2', collapsed ? 'pt-2' : 'pt-0')}>
          <BuyerCatalogSearchInput
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        </div>

        {categoryChips ? (
          <div className="border-t border-[var(--border-1)] bg-[var(--bg-base)] pb-2 pt-2.5">
            {categoryChips}
          </div>
        ) : null}
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
