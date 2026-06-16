'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { openBuyerSearch } from './BuyerSearchOverlay';

export interface BuyerSearchIconButtonProps {
  href?: string;
  className?: string;
}

export function BuyerSearchIconButton({ className }: BuyerSearchIconButtonProps): React.ReactNode {
  return (
    <button
      type="button"
      onClick={() => openBuyerSearch()}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--cream-200)] text-[var(--cream-700)]',
        className,
      )}
      aria-label="Search"
    >
      <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
    </button>
  );
}
