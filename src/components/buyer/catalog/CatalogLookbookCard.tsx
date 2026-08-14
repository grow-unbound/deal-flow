'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import {
  BUYER_LOOKBOOK_ASPECT_CLASS,
  BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX,
  BUYER_LOOKBOOK_COMPACT_CAROUSEL_SIZES,
  BUYER_LOOKBOOK_COMPACT_CAROUSEL_WIDTH_CLASS,
} from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

// Decorative per-card gradient stops, no equivalent token exists in globals.css.
const CATALOG_HUES = [
  'linear-gradient(135deg, var(--teal-500) 0%, #2D5549 100%)', // token-exempt
  'linear-gradient(135deg, #874720 0%, var(--ember-400) 100%)', // token-exempt
  'linear-gradient(135deg, var(--cream-800) 0%, #3D3A35 100%)', // token-exempt
];

export interface CatalogLookbookCardProps {
  id: string;
  name: string;
  productCount: number;
  href: string;
  validUntil?: string | null;
  heroImageUrl?: string | null;
  hueIndex?: number;
  /** `carousel` = fixed width for horizontal scroll; `list` = full-width stack row */
  layout?: 'carousel' | 'list';
  /** `compact` = narrower responsive width + tighter text block (Campaigns rail). */
  size?: 'default' | 'compact';
  priority?: boolean;
}

function formatCampaignValidity(iso: string | null | undefined): string {
  if (!iso) return 'Live';
  const endDate = new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
  });
  return `Valid until ${endDate}`;
}

export function CatalogLookbookCard({
  name,
  productCount,
  href,
  validUntil,
  heroImageUrl,
  hueIndex = 0,
  layout = 'carousel',
  size = 'default',
  priority = false,
}: CatalogLookbookCardProps): React.ReactNode {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(heroImageUrl) && !imgError;
  const gradient = CATALOG_HUES[hueIndex % CATALOG_HUES.length];
  const isList = layout === 'list';
  const isCompact = !isList && size === 'compact';

  return (
    <Link
      href={href}
      onClick={() => markBuyerNavigationForward()}
      className={cn(
        'block overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] no-underline shadow-[var(--shadow-xs)]',
        BUYER_CARD_RADIUS_CLASS,
        isList ? 'w-full' : 'shrink-0',
        isCompact && BUYER_LOOKBOOK_COMPACT_CAROUSEL_WIDTH_CLASS,
      )}
      style={isList || isCompact ? undefined : { width: BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX }}
    >
      <div className={cn('buyer-lookbook-preview bg-[var(--bg-base)]', BUYER_LOOKBOOK_ASPECT_CLASS)}>
        {showImage ? (
          <Image
            src={heroImageUrl!}
            alt={name}
            fill
            className="object-cover object-center"
            sizes={isList ? '100vw' : isCompact ? BUYER_LOOKBOOK_COMPACT_CAROUSEL_SIZES : `${BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX}px`}
            onError={() => setImgError(true)}
            unoptimized
            priority={priority}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient }} aria-hidden />
        )}
      </div>
      <div
        className={
          isList
            ? 'bg-[var(--bg-surface)] px-4 py-3.5'
            : isCompact
              ? 'bg-white px-3.5 py-3'
              : 'bg-white px-5 py-4'
        }
      >
        <p
          className={cn('m-0 font-medium text-[var(--cream-900)]', BUYER_TWO_LINE_TITLE_CLASS)}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isList || isCompact ? 'var(--b-text-body)' : 'var(--b-text-section)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          {name}
        </p>
        <div
          className={
            isList
              ? 'mt-2 flex items-center justify-between text-sm text-[var(--fg-2)]'
              : isCompact
                ? 'mt-1.5 flex items-center justify-between text-[var(--b-text-eyebrow)] font-medium tracking-[-0.01em]'
                : 'mt-2 flex items-center justify-between text-[var(--b-text-sub)] font-medium tracking-[-0.01em]'
          }
        >
          <span>
            <strong className={isList ? 'font-medium text-[var(--fg-1)]' : 'font-medium text-[var(--cream-900)]'}>
              {productCount}
            </strong>{' '}
            products
          </span>
          <span>{formatCampaignValidity(validUntil)}</span>
        </div>
      </div>
    </Link>
  );
}
