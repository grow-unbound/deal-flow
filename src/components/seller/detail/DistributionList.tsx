import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardEmptyState } from './CardEmptyState';

export interface DistributionListItem {
  id: string;
  label: string;
  value?: ReactNode;
  supporting?: ReactNode;
  pct?: number | null;
  tone?: string;
}

export interface DistributionListProps {
  items: DistributionListItem[];
  emptyTitle: string;
  emptyDescription?: ReactNode;
  loading?: boolean;
  compact?: boolean;
  mode?: 'distribution' | 'mix' | 'funnel';
  className?: string;
}

function DistributionSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn(compact ? 'p-4' : 'p-5')}>
      <div className="h-5 animate-pulse rounded-full bg-cream-100" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-12 animate-pulse rounded bg-cream-100" />
            </div>
            <div className="h-2.5 animate-pulse rounded-full bg-cream-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DistributionList({
  items,
  emptyTitle,
  emptyDescription,
  loading = false,
  compact = false,
  mode = 'distribution',
  className,
}: DistributionListProps) {
  if (loading) return <DistributionSkeleton compact={compact} />;

  if (items.length === 0) {
    return (
      <div className={cn(compact ? 'p-4' : 'p-5', className)}>
        <CardEmptyState title={emptyTitle} description={emptyDescription} compact={compact} />
      </div>
    );
  }

  const palette =
    mode === 'mix'
      ? ['#204A41', '#B7703D', '#A59984', '#C07A43', '#6E8F87']
      : ['#346A5C', '#7EA89A', '#D9C6B4', '#C26E3A', '#E7D8CB'];

  if (mode === 'funnel') {
    const funnelPalette = ['#204A41', '#3B6659', '#57816F', '#7EA89A', '#A8C7BC'];
    return (
      <div className={cn(compact ? 'p-4' : 'p-5', className)}>
        <div className="flex flex-col gap-2.5">
          {items.map((item, index) => {
            const width = Math.max(Math.min(item.pct ?? 0, 100), 4);
            const color = item.tone ?? funnelPalette[index % funnelPalette.length];
            return (
              <div key={item.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm text-cream-800 sm:w-36">{item.label}</span>
                <div className="h-8 flex-1 overflow-hidden rounded-lg bg-cream-100">
                  <div
                    className="flex h-full items-center rounded-lg px-3"
                    style={{ width: `${width}%`, backgroundColor: color }}
                    role="img"
                    aria-label={`${item.label}: ${item.value ?? ''} ${item.pct ?? 0}%`}
                  />
                </div>
                <span className="ml-1 flex shrink-0 items-baseline gap-2 font-mono text-sm text-cream-900">
                  {item.value != null ? <span>{item.value}</span> : null}
                  {item.pct != null ? <span className="text-cream-600">{item.pct}%</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(compact ? 'p-4' : 'p-5', className)}>
      <div className="flex h-4 overflow-hidden rounded-full border border-cream-300 bg-cream-100">
        {items.map((item, index) => {
          const width = Math.max(item.pct ?? 0, 0);
          const hoverSummary = [item.label, item.pct != null ? `${item.pct}% share` : null, typeof item.value === 'string' ? item.value : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <div
              key={item.id}
              aria-label={`${item.label} share`}
              title={hoverSummary}
              style={{ width: `${width}%`, backgroundColor: item.tone ?? palette[index % palette.length] }}
              className="h-full"
            />
          );
        })}
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: item.tone ?? palette[index % palette.length] }}
                />
                <span className="truncate text-base text-cream-900">{item.label}</span>
              </div>
              <div className="text-right">
                {item.pct != null ? <span className="font-mono text-sm text-cream-700">{item.pct}%</span> : null}
                {item.value ? <div className="text-sm text-cream-900">{item.value}</div> : null}
              </div>
            </div>
            {item.supporting ? <p className="text-sm text-cream-600">{item.supporting}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
