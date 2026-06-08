'use client';

import type { ReactNode } from 'react';

export function DocTitleRow({
  title,
  subtitle,
  rightActions,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  rightActions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.01em] text-cream-950">{title}</h1>
        <div className="mt-1.5 text-[13px] leading-[1.55] text-cream-700">{subtitle}</div>
      </div>
      {rightActions ? <div className="flex shrink-0 items-center gap-2">{rightActions}</div> : null}
    </div>
  );
}
