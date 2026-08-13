'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { BuyerCatalogSearchInput } from '@/components/buyer/layout/BuyerCatalogSearchInput';
import { BuyerCatalogLocationLink } from '@/components/buyer/layout/BuyerCatalogLocationLink';
import { useBuyerScrollCollapse } from '@/hooks/useBuyerScrollCollapse';
import { useBuyerMe } from '@/hooks/useBuyerMe';

interface BuyerCatalogLandingHeaderProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLoading?: boolean;
}

function getInitials(value: string | null | undefined) {
  const parts = (value ?? '').split(/\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return 'YT';
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? 'YT').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

export function BuyerCatalogLandingHeader({
  searchPlaceholder = 'Search products, SKU, brand…',
  searchValue,
  onSearchChange,
  searchLoading = false,
}: BuyerCatalogLandingHeaderProps) {
  const { collapsed, sentinelRef } = useBuyerScrollCollapse();
  const { data: me } = useBuyerMe();
  const tenantName = me?.tenant.name || 'Yukti';
  const tenantLogoUrl = me?.tenant.logo_url ?? null;

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[15] border-b border-[var(--border-1)] bg-[var(--bg-base)] transition-shadow md:hidden',
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
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-cream-200 bg-white shadow-[var(--shadow-sm)]">
                  {tenantLogoUrl ? (
                    <Image src={tenantLogoUrl} alt={tenantName} width={44} height={44} className="h-full w-full object-contain p-1" unoptimized />
                  ) : (
                    <span className="text-caption font-semibold uppercase text-cream-900">{getInitials(tenantName)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[var(--cream-900)]">{tenantName}</p>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--cream-500)]">Catalog</p>
                </div>
              </div>
              <BuyerCatalogLocationLink className="max-w-[42vw] shrink-0 rounded-[12px] px-1 py-1" />
            </div>
          </div>
        </div>

        <div className={cn('px-4 pb-2', collapsed ? 'pt-2' : 'pt-0')}>
          <BuyerCatalogSearchInput
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            loading={searchLoading}
          />
        </div>
      </header>
      <div ref={sentinelRef} className="h-px w-full shrink-0 bg-transparent" aria-hidden />
    </>
  );
}
