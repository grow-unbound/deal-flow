'use client';

import { cn } from '@/lib/utils';

interface BuyerTransactionFilterChipsProps<T extends string> {
  chips: readonly T[];
  active: T;
  onChange: (chip: T) => void;
  className?: string;
}

export function BuyerTransactionFilterChips<T extends string>({
  chips,
  active,
  onChange,
  className,
}: BuyerTransactionFilterChipsProps<T>) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto px-4 pt-3 pb-1 scrollbar-none', className)}>
      {chips.map((chip) => {
        const isActive = chip === active;
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onChange(chip)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-[length:var(--b-text-label)] font-medium transition-colors',
              isActive
                ? 'border-[var(--teal-500)] bg-[var(--teal-500)] text-white'
                : 'border-[var(--cream-400)] bg-[var(--cream-50)] text-[var(--cream-800)]',
            )}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
