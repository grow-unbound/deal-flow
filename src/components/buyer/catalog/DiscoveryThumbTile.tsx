'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DiscoveryThumbTileProps {
  href: string;
  label: string;
  imageUrl?: string | null;
  subtitle?: string;
  entityKind?: 'brand' | 'category';
  onNavigate?: () => void;
  className?: string;
  variant?: 'grid' | 'scroll';
}

export function DiscoveryThumbTile({
  href,
  label,
  imageUrl,
  subtitle,
  entityKind = 'category',
  onNavigate,
  className,
  variant = 'grid',
}: DiscoveryThumbTileProps): React.ReactNode {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(imageUrl) && !imgError;
  const FallbackIcon = entityKind === 'brand' ? Store : LayoutGrid;
  const isGridCategoryTile = variant === 'grid' && entityKind === 'category';

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex h-full flex-col no-underline',
        isGridCategoryTile &&
          'overflow-hidden rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface)] text-left shadow-[0_1px_3px_rgba(34,30,26,0.06),0_4px_12px_rgba(34,30,26,0.05)] transition-all hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(34,30,26,0.08),0_2px_6px_rgba(34,30,26,0.05)]',
        variant === 'grid' && !isGridCategoryTile && 'items-center rounded-lg bg-[var(--bg-surface)] px-2 py-3 shadow-[var(--shadow-sm)]',
        variant === 'scroll' && 'w-[88px] shrink-0 items-center',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden',
          isGridCategoryTile && 'flex aspect-square w-full items-center justify-center bg-[var(--bg-surface)]',
          variant === 'grid' && !isGridCategoryTile && 'rounded-md bg-[var(--bg-recessed)] aspect-square w-full',
          variant === 'scroll' && 'h-[72px] w-[72px] rounded-md bg-[var(--bg-recessed)]',
        )}
      >
        {showImage ? (
          <Image
            src={imageUrl!}
            alt={label}
            fill
            className={cn(
              isGridCategoryTile ? 'object-contain p-3.5' : 'p-2.5',
              entityKind === 'category' ? 'object-contain' : 'object-cover',
            )}
            sizes={variant === 'grid' ? '120px' : '72px'}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FallbackIcon className={isGridCategoryTile ? 'h-10 w-10 text-[var(--fg-3)]' : 'h-6 w-6 text-[var(--fg-3)]'} aria-hidden />
          </div>
        )}
      </div>
      <div
        className={cn(
          'min-w-0 w-full',
          isGridCategoryTile && 'flex h-full flex-1 flex-col bg-[var(--cream-50)] px-3 pb-3 pt-2.5',
        )}
      >
        <p
          className={cn(
            'font-medium leading-[1.2] text-[var(--fg-1,var(--cream-900))]',
            isGridCategoryTile ? 'line-clamp-2' : variant === 'grid' ? 'line-clamp-2 text-xs' : 'truncate text-xs',
          )}
          style={isGridCategoryTile ? { fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-body)', fontWeight: 500, letterSpacing: '-0.005em' } : variant === 'grid' ? { fontFamily: 'var(--font-display)' } : undefined}
        >
          {label}
        </p>
        {subtitle ? (
          <p
            className={cn(
              'mt-0.5 text-xs text-[var(--fg-3,var(--cream-500))]',
              isGridCategoryTile && 'truncate text-[var(--cream-700)]',
            )}
            style={isGridCategoryTile ? { fontSize: 'var(--b-text-sub)' } : undefined}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
