import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CardEmptyStateProps {
  title: string;
  description?: ReactNode;
  tone?: 'empty' | 'unavailable' | 'error';
  compact?: boolean;
  className?: string;
}

export function CardEmptyState({
  title,
  description,
  tone = 'empty',
  compact = false,
  className,
}: CardEmptyStateProps) {
  const toneClass =
    tone === 'error'
      ? 'border-danger-200 bg-danger-50 text-danger-700'
      : tone === 'unavailable'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-cream-200 bg-cream-50 text-cream-700';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[12px] border px-4 py-4',
        compact ? 'px-3 py-3' : '',
        toneClass,
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm">{description}</p> : null}
      </div>
    </div>
  );
}
