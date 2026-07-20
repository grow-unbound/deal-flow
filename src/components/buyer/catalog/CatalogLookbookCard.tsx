'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { BUYER_LOOKBOOK_ASPECT_CLASS, BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX } from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

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
  /** `carousel` = fixed width for horizontal scroll; `list` = full-width stack row */
  layout?: 'carousel' | 'list';
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
}: CatalogLookbookCardProps): React.ReactNode {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(heroImageUrl) && !imgError;
  const gradient = CATALOG_HUES[hueIndex % CATALOG_HUES.length];
  const isList = layout === 'list';

  return (
    <Link
      href={href}
      onClick={() => markBuyerNavigationForward()}
      className={cn(
        'block overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] no-underline shadow-[0_1px_0_rgba(34,30,26,0.03)]',
        BUYER_CARD_RADIUS_CLASS,
        isList ? 'w-full' : 'shrink-0',
      )}
      style={isList ? undefined : { width: BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX }}
    >
      <div className={cn('buyer-lookbook-preview bg-[var(--bg-base)]', BUYER_LOOKBOOK_ASPECT_CLASS)}>
        {showImage ? (
          <Image
            src={heroImageUrl!}
            alt={name}
            fill
            className="object-cover object-center"
            sizes={isList ? '100vw' : `${BUYER_LOOKBOOK_CAROUSEL_WIDTH_PX}px`}
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient }} aria-hidden />
        )}
      </div>
      <div
        className={
          isList
            ? 'bg-[var(--bg-surface)] px-4 py-3.5'
            : 'bg-white px-5 py-4'
        }
      >
        <p
          className="m-0 line-clamp-2 font-medium leading-[1.2] text-[var(--cream-900)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isList ? 'var(--b-text-body)' : 'var(--b-text-section)',
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
              : 'mt-2 flex items-center justify-between text-[var(--b-text-sub)] font-medium tracking-[-0.01em] text-[var(--cream-700)]'
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
