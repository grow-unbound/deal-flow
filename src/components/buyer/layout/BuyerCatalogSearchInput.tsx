'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuyerCatalogSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function BuyerCatalogSearchInput({
  value,
  onChange,
  placeholder = 'Search products, SKU, brand…',
  className,
}: BuyerCatalogSearchInputProps): React.ReactNode {
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-3)]"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-[12px] border-0 bg-[var(--bg-recessed)] py-2.5 pl-9 pr-3',
          'text-[var(--fg-1)] placeholder:text-[var(--fg-4)] outline-none',
          'focus:ring-1 focus:ring-[var(--teal-500)]/30',
        )}
        style={{ fontSize: 'var(--b-text-body)' }}
        aria-label="Search catalog"
      />
    </div>
  );
}
