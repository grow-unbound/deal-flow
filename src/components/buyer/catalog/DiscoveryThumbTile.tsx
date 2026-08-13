'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUYER_CARD_IMAGE_SIZES, BUYER_CARD_RADIUS_CLASS, BUYER_TILE_FRAME_CLASS, BUYER_TILE_HOVER_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';

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
  const isBrand = entityKind === 'brand';

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex h-full flex-col text-left no-underline transition-colors',
        isBrand
          ? 'items-center'
          : cn(BUYER_CARD_RADIUS_CLASS, BUYER_TILE_FRAME_CLASS, BUYER_TILE_HOVER_CLASS),
        variant === 'scroll' && isBrand && 'w-[calc((100vw-2.5rem)/3)] max-w-[124px] shrink-0',
        variant === 'scroll' && !isBrand && 'w-[88px] shrink-0 items-center',
        className,
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden',
          isBrand
            ? cn('flex aspect-square w-full items-center justify-center rounded-full', BUYER_TILE_FRAME_CLASS, BUYER_TILE_HOVER_CLASS)
            : 'flex aspect-square w-full items-center justify-center',
        )}
      >
        {showImage ? (
          <Image
            src={imageUrl!}
            alt={label}
            fill
            className="object-contain p-1.5"
            sizes={variant === 'grid' && !isBrand ? BUYER_CARD_IMAGE_SIZES : variant === 'grid' ? '120px' : '88px'}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FallbackIcon className="h-10 w-10 text-[var(--fg-3)]" aria-hidden />
          </div>
        )}
      </div>
      <div
        className={cn(
          'min-w-0 w-full',
          isBrand ? 'flex flex-col items-center px-1 pt-1.5 text-center' : 'flex flex-1 flex-col px-3 pt-2.5',
        )}
      >
        <p
          className={cn(BUYER_TWO_LINE_TITLE_CLASS, 'font-medium text-[var(--cream-900)]', isBrand && 'text-center')}
          style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-body)', fontWeight: 500, letterSpacing: '-0.005em' }}
        >
          {label}
        </p>
        {subtitle ? (
          <p className="truncate text-[var(--cream-700)]" style={{ fontSize: 'var(--b-text-sub)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
