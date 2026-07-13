'use client';

import * as React from 'react';
import Link from 'next/link';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';

interface ActivityCardShellProps {
  href?: string;
  onClick?: () => void;
  documentNumber: string;
  statusLabel: string;
  statusTone: StatusTone;
  middleLeft: React.ReactNode;
  middleRight?: React.ReactNode;
  amount: React.ReactNode;
  trailing?: React.ReactNode;
}

export function ActivityCardShell({
  href,
  onClick,
  documentNumber,
  statusLabel,
  statusTone,
  middleLeft,
  middleRight,
  amount,
  trailing,
}: ActivityCardShellProps) {
  const content = (
    <div className={cn(BUYER_CARD_RADIUS_CLASS, 'border border-[var(--border-1)] bg-white px-3.5 py-3 text-left no-underline transition hover:bg-white')}>
      <div className="flex items-start justify-between gap-3">
        {/* Left column */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[var(--b-text-body)] text-[var(--cream-700)]">{documentNumber}</p>
          <p className="mt-0.5 truncate text-[var(--b-text-body)] text-[var(--cream-800)]">{middleLeft}</p>
          {middleRight && (
            <p className="mt-0.5 text-[var(--b-text-sub)] text-[var(--cream-600)]">{middleRight}</p>
          )}
        </div>

        {/* Right column */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            {trailing}
            <StatusPill label={statusLabel} tone={statusTone} />
          </div>
          <p className="text-right text-[var(--b-text-body)] font-semibold text-[var(--cream-900)]">{amount}</p>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className="block no-underline">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
}
