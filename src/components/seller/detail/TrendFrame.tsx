import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardEmptyState } from './CardEmptyState';

export interface TrendFrameProps {
  summary?: ReactNode;
  chart?: ReactNode;
  controls?: ReactNode;
  emptyTitle: string;
  emptyDescription?: ReactNode;
  loading?: boolean;
  className?: string;
}

function TrendFrameSkeleton() {
  return (
    <div className="p-5">
      <div className="space-y-2">
        <div className="h-8 w-28 animate-pulse rounded bg-cream-200" />
        <div className="h-4 w-48 animate-pulse rounded bg-cream-100" />
      </div>
      <div className="mt-4 h-[220px] animate-pulse rounded-[12px] bg-cream-50" />
    </div>
  );
}

export function TrendFrame({
  summary,
  chart,
  controls,
  emptyTitle,
  emptyDescription,
  loading = false,
  className,
}: TrendFrameProps) {
  if (loading) return <TrendFrameSkeleton />;

  return (
    <div className={cn('p-0', className)}>
      {summary || controls ? (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">{summary}</div>
          {controls ? <div className="shrink-0">{controls}</div> : null}
        </div>
      ) : null}
      {chart ? (
        <div className="h-[220px] px-4 pb-4 pt-2">{chart}</div>
      ) : (
        <div className="p-5">
          <CardEmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}
    </div>
  );
}
