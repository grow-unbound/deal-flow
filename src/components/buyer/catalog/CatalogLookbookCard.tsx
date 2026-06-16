'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';

const CATALOG_HUES = [
  'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
  'linear-gradient(135deg, #874720 0%, #C26E3A 100%)',
  'linear-gradient(135deg, #6B6760 0%, #3D3A35 100%)',
];

export interface CatalogLookbookCardProps {
  id: string;
  name: string;
  productCount: number;
  href: string;
  validUntil?: string | null;
  heroImageUrl?: string | null;
  hueIndex?: number;
}

function formatValidUntil(iso: string | null | undefined): string {
  if (!iso) return 'No end date';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CatalogLookbookCard({
  name,
  productCount,
  href,
  validUntil,
  heroImageUrl,
  hueIndex = 0,
}: CatalogLookbookCardProps): React.ReactNode {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(heroImageUrl) && !imgError;
  const gradient = CATALOG_HUES[hueIndex % CATALOG_HUES.length];

  return (
    <Link
      href={href}
      onClick={() => markBuyerNavigationForward()}
      className="block shrink-0 overflow-hidden rounded-xl border border-[var(--border-1)] no-underline"
      style={{ width: 200 }}
    >
      <div className="relative flex h-[90px] items-end overflow-hidden p-3.5">
        {showImage ? (
          <Image
            src={heroImageUrl!}
            alt={name}
            fill
            className="object-cover"
            sizes="200px"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient }} />
        )}
        {showImage ? (
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(20, 40, 35, 0) 0%, rgba(20, 40, 35, 0.55) 100%)',
            }}
          />
        ) : null}
        <h4
          className="relative z-[1] text-base font-semibold leading-tight text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {name}
        </h4>
      </div>
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: 'var(--cream-50)' }}
      >
        <span className="text-sm text-[var(--cream-700)]">
          <strong className="font-medium text-[var(--cream-900)]">{productCount}</strong> products
        </span>
        <span className="text-xs text-[var(--cream-500)]">{formatValidUntil(validUntil)}</span>
      </div>
    </Link>
  );
}
