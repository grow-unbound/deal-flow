'use client';

import * as React from 'react';
import Image from 'next/image';
import { Megaphone } from 'lucide-react';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';

interface CampaignSummaryBlockProps {
  message?: string | null;
  validUntil?: string | null;
}

interface CampaignTitleRowProps {
  name: string;
  imageUrl?: string | null;
}

export function CampaignTitleRow({ name, imageUrl }: CampaignTitleRowProps): React.ReactNode {
  const [imgError, setImgError] = React.useState(false);
  const showImage = Boolean(imageUrl) && !imgError;

  return (
    <div className="mb-3 flex items-center gap-3">
      <div
        className={`relative h-11 w-11 shrink-0 overflow-hidden ${BUYER_CARD_RADIUS_CLASS}`}
        style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface)' }}
      >
        {showImage ? (
          <Image
            src={imageUrl!}
            alt=""
            fill
            className="object-cover"
            sizes="44px"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--fg-3)]">
            <Megaphone className="h-5 w-5" />
          </div>
        )}
      </div>
      <h1
        className="min-w-0 flex-1 truncate font-semibold text-[var(--fg-1)]"
        style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-page-sm)', letterSpacing: '-0.01em' }}
      >
        {name}
      </h1>
    </div>
  );
}

function formatValidUntil(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function CampaignSummaryBlock({ message, validUntil }: CampaignSummaryBlockProps): React.ReactNode {
  const note = message?.trim();
  const hasNote = Boolean(note);
  const hasValidity = Boolean(validUntil);

  if (!hasNote && !hasValidity) return null;

  return (
    <div
      className={`mx-2 mb-3 ${BUYER_CARD_RADIUS_CLASS} px-4 py-3`}
      style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface)' }}
    >
      {hasNote ? (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-2)' }}>
          {note}
        </p>
      ) : null}
      {hasValidity ? (
        <p
          className={hasNote ? 'mt-2 text-sm font-semibold' : 'text-sm font-semibold'}
          style={{ color: 'var(--warning-500)' }}
        >
          Valid until {formatValidUntil(validUntil!)}
        </p>
      ) : null}
    </div>
  );
}
