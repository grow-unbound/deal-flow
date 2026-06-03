'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface Brand {
  id: string;
  name: string;
}

interface BrandFilterProps {
  brands: Brand[];
  selected: string | null;
  onChange: (id: string | null) => void;
}

export function BrandFilter({ brands, selected, onChange }: BrandFilterProps) {
  if (brands.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Filter by brand"
    >
      <button
        onClick={() => onChange(null)}
        className={cn(
          'flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
          selected === null
            ? 'bg-[var(--teal-500)] text-white'
            : 'bg-[var(--bg-recessed)] text-[var(--fg-2)] border border-[var(--border-1)]',
        )}
        aria-pressed={selected === null}
      >
        All
      </button>
      {brands.map((brand) => (
        <button
          key={brand.id}
          onClick={() => onChange(selected === brand.id ? null : brand.id)}
          className={cn(
            'flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
            selected === brand.id
              ? 'bg-[var(--teal-500)] text-white'
              : 'bg-[var(--bg-recessed)] text-[var(--fg-2)] border border-[var(--border-1)]',
          )}
          aria-pressed={selected === brand.id}
        >
          {brand.name}
        </button>
      ))}
    </div>
  );
}
