'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterChip {
  id: string;
  label: string;
}

interface CatalogHeroProps {
  tenantName: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  categories?: FilterChip[];
  activeCategory?: string;
  onCategoryChange?: (id: string | undefined) => void;
  className?: string;
}

function CatalogHero({
  tenantName,
  searchQuery = '',
  onSearchChange,
  categories = [],
  activeCategory,
  onCategoryChange,
  className,
}: CatalogHeroProps) {
  return (
    <div className={cn('bg-white border-b border-cream-200', className)}>
      {/* Hero strip */}
      <div className="px-4 pt-4 pb-3 bg-teal-500">
        <p className="text-caption text-teal-200 mb-0.5">Welcome to</p>
        <h1 className="text-h3 font-display font-medium text-cream-50">{tenantName}</h1>
      </div>

      {/* Search */}
      <div className="px-4 py-3 bg-teal-500">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-500 pointer-events-none" />
          <input
            type="search"
            placeholder="Search products…"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className={cn(
              'w-full h-10 pl-9 pr-4 rounded-md bg-white border border-cream-200 text-body text-cream-900',
              'placeholder:text-cream-500',
              'focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20',
              'transition-colors duration-fast'
            )}
          />
        </div>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none">
          <FilterChip
            label="All"
            active={!activeCategory}
            onClick={() => onCategoryChange?.(undefined)}
          />
          {categories.map((cat) => (
            <FilterChip
              key={cat.id}
              label={cat.label}
              active={activeCategory === cat.id}
              onClick={() => onCategoryChange?.(cat.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 h-8 px-3 rounded-pill text-body-sm font-medium transition-colors duration-fast',
        active
          ? 'bg-teal-500 text-cream-50'
          : 'bg-cream-100 text-cream-700 border border-cream-300 hover:bg-cream-200'
      )}
    >
      {label}
    </button>
  );
}

export { CatalogHero };
