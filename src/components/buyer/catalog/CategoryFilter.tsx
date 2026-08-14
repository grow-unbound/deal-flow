'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { BuyerCategory } from '@/types/buyer';

interface CategoryFilterProps {
  categories: BuyerCategory[];
  selected: string | null;
  onChange: (id: string | null) => void;
}

export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  if (categories.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Filter by category"
    >
      <button
        onClick={() => onChange(null)}
        className={cn(
          'flex-shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors whitespace-nowrap',
          selected === null
            ? 'border border-[var(--teal-100)] bg-[var(--teal-50)] text-[var(--teal-700)] shadow-[inset_3px_0_0_0_var(--teal-500)]'
            : 'border border-[var(--border-1)] bg-[var(--bg-surface)] text-[var(--fg-2)]',
        )}
        style={{ fontSize: 'var(--b-text-label)' }}
        aria-pressed={selected === null}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onChange(selected === cat.id ? null : cat.id)}
          className={cn(
            'flex-shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors whitespace-nowrap',
            selected === cat.id
              ? 'border border-[var(--teal-100)] bg-[var(--teal-50)] text-[var(--teal-700)] shadow-[inset_3px_0_0_0_var(--teal-500)]'
              : 'border border-[var(--border-1)] bg-[var(--bg-surface)] text-[var(--fg-2)]',
          )}
          style={{ fontSize: 'var(--b-text-label)' }}
          aria-pressed={selected === cat.id}
        >
          {cat.name}
          {cat.product_count > 0 && (
            <span
              className={cn(
                'ml-1.5',
                selected === cat.id ? 'text-[var(--teal-600)]' : 'text-[var(--fg-3)]',
              )}
              style={{ fontSize: 'var(--b-text-eyebrow)' }}
            >
              {cat.product_count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
