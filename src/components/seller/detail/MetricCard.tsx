import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MetricTile {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'up' | 'down' | 'neutral';
  tone?: 'accent' | 'warn';
  /** Makes the tile clickable — e.g. the expanded-view KPI grid, where clicking a
   * tile selects it for the split-pane header's dynamic title. Omit for the
   * static, non-interactive strips used elsewhere (detail-page metric grids). */
  onClick?: () => void;
  selected?: boolean;
}

export interface MetricCardProps extends MetricTile {
  className?: string;
  showSupportingText?: boolean;
}

export function MetricCard({
  label,
  value,
  sub,
  delta,
  deltaTone = 'neutral',
  tone,
  className,
  showSupportingText = true,
  onClick,
  selected,
}: MetricCardProps) {
  const hasSupportingText = showSupportingText && (sub || delta);

  return (
    <article
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      className={cn(
        'rounded-[14px] border border-cream-300 bg-white px-[18px] py-[16px] transition duration-150 hover:border-cream-400 focus-within:ring-2 focus-within:ring-ember-300/70 active:scale-[0.97]',
        tone === 'warn' && 'border-ember-300',
        onClick && 'cursor-pointer',
        selected && 'border-ember-300 ring-1 ring-ember-200',
        className,
      )}
    >
      <p className={cn('eyebrow text-cream-600', tone === 'warn' && 'text-ember-700')}>{label}</p>
      <p
        className={cn(
          'mt-2 font-display text-xl font-medium leading-[1.05] text-[#4A3F35] tabular-nums',
          tone === 'warn' && 'text-ember-500',
        )}
      >
        {value}
      </p>
      {hasSupportingText ? (
        <p className={cn('mt-2 flex items-center gap-2 text-sm text-cream-700', tone === 'warn' && 'text-ember-700')}>
          {sub}
          {delta ? (
            <span
              className={cn(
                sub && 'ml-1 font-semibold',
                deltaTone === 'up' && 'text-success-500',
                deltaTone === 'down' && 'text-danger-500',
              )}
            >
              {delta}
            </span>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
