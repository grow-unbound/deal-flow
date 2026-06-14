import { cn } from '@/lib/utils';

interface InsightTile {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaTone?: 'up' | 'down';
  tone?: 'accent' | 'warn';
}

interface InsightStrip4Props {
  tiles: InsightTile[];
}

export function InsightStrip4({ tiles }: InsightStrip4Props) {
  if (tiles.length !== 4) {
    console.warn(`InsightStrip4 expects exactly 4 tiles; received ${tiles.length}.`);
  }

  return (
    <section className="grid grid-cols-4 gap-3 mt-5 mb-0">
      {tiles.map((tile, index) => (
        <article
          key={`${tile.label}-${index}`}
          className={cn(
            'rounded-[14px] border border-cream-300 bg-white px-[18px] py-[16px]',
            tile.tone === 'accent' && 'border-teal-500 bg-teal-500 text-cream-50',
            tile.tone === 'warn' && 'border-ember-300'
          )}
        >
          <p
            className={cn(
              'eyebrow text-cream-600',
              tile.tone === 'accent' && 'text-teal-100'
            )}
          >
            {tile.label}
          </p>
          <p
            className={cn(
              'mt-2 font-display text-2xl font-medium leading-[1.05] tracking-[-0.015em] text-[#4A3F35] tabular-nums',
              tile.tone === 'accent' && 'text-cream-50',
              tile.tone === 'warn' && 'text-ember-500'
            )}
          >
            {tile.value}
          </p>
          {(tile.sub || tile.delta) && (
            <p
              className={cn(
                'mt-2 flex items-center gap-2 text-sm text-cream-700',
                tile.tone === 'accent' && 'text-teal-100'
              )}
            >
              {tile.sub}
              {tile.delta && (
                <span
                  className={cn(
                    tile.sub && 'ml-1 font-semibold',
                    tile.deltaTone === 'up' && 'text-success-500',
                    tile.deltaTone === 'down' && 'text-danger-500',
                    tile.tone === 'accent' && tile.deltaTone === 'up' && 'text-success-50'
                  )}
                >
                  {tile.delta}
                </span>
              )}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

export type { InsightTile };
