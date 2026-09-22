'use client';

import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared mobile-header back control — one visual pattern (circle, ArrowLeft)
 * used by every seller-mobile header instead of each surface hand-rolling its
 * own container classes. */
export function MobileBackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] p-0 text-[var(--fg-2)] transition-colors active:bg-[var(--cream-100)]',
        className,
      )}
      aria-label="Back"
    >
      <ArrowLeft size={18} />
    </button>
  );
}
