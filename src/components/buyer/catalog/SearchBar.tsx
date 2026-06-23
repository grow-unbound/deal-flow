'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search products, brands, SKUs…',
  className,
}: SearchBarProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fg-3)] pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full bg-white border border-[var(--cream-400)] rounded-[12px]',
          'pl-9 pr-9 py-2.5 text-[var(--fg-1)] placeholder:text-[var(--fg-3)]',
          'outline-none focus:border-[var(--teal-500)] transition-colors',
        )}
        style={{ fontSize: 'var(--b-text-body)' }}
        aria-label="Search products"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
