import type { ReactNode } from 'react';
import { EntityAvatar } from '@/components/seller/layout';
import { cn } from '@/lib/utils';
import { CardEmptyState } from './CardEmptyState';

export interface RankedListItem {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
  metaClassName?: string;
  value?: ReactNode;
  supporting?: ReactNode;
  valueSupporting?: ReactNode;
  initials?: string;
  hue?: 'teal' | 'ember' | 'cream';
}

export interface RankedListProps {
  items: RankedListItem[];
  emptyTitle: string;
  emptyDescription?: ReactNode;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

function RankedListSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('space-y-2', compact ? 'p-4' : 'p-5')}>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[12px] border border-cream-200 bg-cream-50 px-3 py-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-cream-200" />
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-cream-100" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
            <div className="h-3 w-12 animate-pulse rounded bg-cream-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RankedList({
  items,
  emptyTitle,
  emptyDescription,
  loading = false,
  compact = false,
  className,
}: RankedListProps) {
  if (loading) return <RankedListSkeleton compact={compact} />;

  if (items.length === 0) {
    return (
      <div className={cn(compact ? 'p-4' : 'p-5', className)}>
        <CardEmptyState title={emptyTitle} description={emptyDescription} compact={compact} />
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            'grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-cream-300 px-3 py-2 last:border-b-0',
            compact ? 'px-3 py-2' : '',
          )}
        >
          <div className="flex items-center gap-3">
            <span className="w-4 shrink-0 font-mono text-xs text-cream-600">{index + 1}</span>
            {item.initials ? (
              <EntityAvatar initials={item.initials} hue={item.hue ?? 'teal'} size={compact ? 28 : 32} />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="min-w-0 text-base font-medium text-cream-900">{item.label}</div>
            {item.meta ? <div className={cn('mt-0.5 truncate text-xs text-cream-700', item.metaClassName)}>{item.meta}</div> : null}
          </div>
          <div className="text-right">
            {item.value ? <p className="font-display text-md leading-none text-cream-950">{item.value}</p> : null}
            {item.valueSupporting ? <p className="mt-1 text-xs text-cream-700">{item.valueSupporting}</p> : null}
            {item.supporting ? <p className="mt-1 text-xs text-cream-700">{item.supporting}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
