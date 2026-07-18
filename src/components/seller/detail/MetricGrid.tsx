import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MetricCard, type MetricTile } from './MetricCard';

export interface MetricGridProps {
  tiles: MetricTile[];
  className?: string;
  cardClassName?: string;
  showSupportingText?: boolean;
  renderTile?: (tile: MetricTile, index: number) => ReactNode;
  columns?: 'auto' | 'two-by-two';
}

function columnsFor(count: number) {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
}

export function MetricGrid({
  tiles,
  className,
  cardClassName,
  showSupportingText = true,
  renderTile,
  columns = 'auto',
}: MetricGridProps) {
  const visibleTiles = tiles.slice(0, 4);
  const columnsClassName = columns === 'two-by-two' ? 'grid-cols-1 sm:grid-cols-2' : columnsFor(visibleTiles.length);

  return (
    <section className={cn('mt-5 mb-0 grid gap-3', columnsClassName, className)}>
      {visibleTiles.map((tile, index) =>
        renderTile ? (
          <div key={`${tile.label}-${index}`}>{renderTile(tile, index)}</div>
        ) : (
          <MetricCard
            key={`${tile.label}-${index}`}
            {...tile}
            className={cardClassName}
            showSupportingText={showSupportingText}
          />
        ),
      )}
    </section>
  );
}

export type { MetricTile };
