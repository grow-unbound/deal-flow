import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionCardProps {
  title: string;
  sub?: string;
  rightSlot?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}

export function SectionCard({ title, sub, rightSlot, flush = false, children }: SectionCardProps) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-cream-200 bg-white">
      <div className="flex items-center justify-between border-b border-cream-100 px-5 py-3.5">
        <div className="min-w-0">
          <span className="text-[13.5px] font-semibold text-cream-900">{title}</span>
          {sub ? <span className="ml-2 text-[11.5px] text-cream-600">{sub}</span> : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      <div className={cn(!flush && 'px-5 py-4')}>{children}</div>
    </div>
  );
}
