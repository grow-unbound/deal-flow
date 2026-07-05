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

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex flex-col gap-2 text-center no-underline',
        variant === 'grid' && 'items-center rounded-lg bg-[var(--bg-surface)] px-2 py-3 shadow-[var(--shadow-sm)]',
        variant === 'scroll' && 'w-[88px] shrink-0 items-center',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-md bg-[var(--bg-recessed)]',
          variant === 'grid' ? 'aspect-square w-full' : 'h-[72px] w-[72px]',
        )}
      >
        {showImage ? (
          <Image
            src={imageUrl!}
            alt={label}
            fill
            className={cn(
              'p-2.5',
              entityKind === 'category' ? 'object-contain' : 'object-cover',
            )}
            sizes={variant === 'grid' ? '120px' : '72px'}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FallbackIcon className="h-6 w-6 text-[var(--fg-3)]" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full">
        <p
          className={cn(
            'font-medium leading-tight text-[var(--fg-1,var(--cream-900))]',
            variant === 'grid' ? 'line-clamp-2 text-xs' : 'truncate text-xs',
          )}
          style={variant === 'grid' ? { fontFamily: 'var(--font-display)' } : undefined}
        >
          {label}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-[var(--fg-3,var(--cream-500))]">{subtitle}</p>
        ) : null}
      </div>
    </Link>
  );
}
