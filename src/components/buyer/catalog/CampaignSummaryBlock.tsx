'use client';

import * as React from 'react';

interface CampaignSummaryBlockProps {
  message?: string | null;
  validUntil?: string | null;
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
      className="mx-2 mb-3 rounded-xl px-4 py-3"
      style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface)' }}
    >
      {hasNote ? (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-2)' }}>
          {note}
        </p>
      ) : null}
      {hasValidity ? (
        <p
          className={hasNote ? 'mt-2 text-xs font-medium' : 'text-xs font-medium'}
          style={{ color: 'var(--fg-3)' }}
        >
          Valid until {formatValidUntil(validUntil!)}
        </p>
      ) : null}
    </div>
  );
}
