'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DocComposerFoot({
  autoSaveLabel,
  autoSaveTone,
  actions,
}: {
  autoSaveLabel: string;
  autoSaveTone?: 'draft' | 'saved' | 'warning';
  actions: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 rounded-[14px] border border-cream-300 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(34,52,43,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[12px] text-cream-700">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              autoSaveTone === 'warning'
                ? 'bg-amber-500'
                : autoSaveTone === 'saved'
                  ? 'bg-teal-500'
                  : 'bg-cream-500',
            )}
          />
          {autoSaveLabel}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
