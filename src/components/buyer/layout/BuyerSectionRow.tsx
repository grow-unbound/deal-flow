'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';

interface BuyerSectionRowProps {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}

export function BuyerSectionRow({
  title,
  href,
  linkLabel,
  className = 'px-4 pb-3',
}: BuyerSectionRowProps): React.ReactNode {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2
        className="leading-none text-[var(--cream-900)]"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--b-text-section)',
          fontWeight: 500,
          letterSpacing: '-0.005em',
        }}
      >
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          onClick={() => markBuyerNavigationForward()}
          className="inline-flex items-center gap-1.5 font-medium tracking-[-0.01em] text-[var(--teal-500)] no-underline"
          style={{ fontSize: 'var(--b-text-label)' }}
        >
          {linkLabel ?? 'See all'}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}
