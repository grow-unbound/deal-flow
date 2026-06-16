'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const FALLBACK_COLORS = [
  { bg: '#EDF6F3', text: '#2D7A5F' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#EDE9FE', text: '#5B21B6' },
  { bg: '#FEE2E2', text: '#991B1B' },
  { bg: '#E0F2FE', text: '#075985' },
  { bg: '#F0FDF4', text: '#166534' },
];

export interface DiscoveryThumbTileProps {
  href: string;
  label: string;
  imageUrl?: string | null;
  subtitle?: string;
  fallbackInitials?: string;
  colorIndex?: number;
  onNavigate?: () => void;
  className?: string;
  variant?: 'grid' | 'scroll';
}

export function DiscoveryThumbTile({
  href,
  label,
  imageUrl,
  subtitle,
  fallbackInitials,
  colorIndex = 0,
  onNavigate,
  className,
  variant = 'grid',
}: DiscoveryThumbTileProps): React.ReactNode {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(imageUrl) && !imgError;
  const color = FALLBACK_COLORS[colorIndex % FALLBACK_COLORS.length];
  const initials = (fallbackInitials ?? label.slice(0, 2)).toUpperCase();

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex flex-col gap-2 text-center no-underline',
        variant === 'grid' && 'items-center rounded-xl px-2 py-3',
        variant === 'scroll' && 'w-[88px] shrink-0 items-center',
        className,
      )}
      style={variant === 'grid' ? { border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' } : undefined}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-xl bg-[var(--bg-recessed)]',
          variant === 'grid' ? 'aspect-square w-full' : 'h-[72px] w-[72px]',
        )}
        style={!showImage ? { background: color.bg } : undefined}
      >
        {showImage ? (
          <Image
            src={imageUrl!}
            alt={label}
            fill
            className="object-cover"
            sizes={variant === 'grid' ? '120px' : '72px'}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {variant === 'grid' ? (
              <span className="text-sm font-bold" style={{ color: color.text }}>
                {initials}
              </span>
            ) : (
              <Package className="h-6 w-6" style={{ color: color.text }} />
            )}
          </div>
        )}
      </div>
      <div className="min-w-0 w-full">
        <p
          className={cn(
            'font-medium leading-tight text-[var(--fg-1,var(--cream-900))]',
            variant === 'grid' ? 'line-clamp-2 text-xs' : 'truncate text-xs',
          )}
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
