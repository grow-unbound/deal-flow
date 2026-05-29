import type { ReactNode } from 'react';

interface MetaTile {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

interface MetaStrip4Props {
  tiles: MetaTile[];
}

export function MetaStrip4({ tiles }: MetaStrip4Props) {
  if (tiles.length !== 4) {
    console.warn(`MetaStrip4 expects exactly 4 tiles; received ${tiles.length}.`);
  }

  return (
    <section className="mt-6 mb-0 grid grid-cols-4 gap-3">
      {tiles.map((tile, index) => (
        <article key={`${tile.label}-${index}`} className="min-h-[112px] rounded-[14px] border border-cream-300 bg-white px-[18px] py-[14px]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cream-700">{tile.label}</p>
          <p className="mt-1.5 font-display text-[22px] font-semibold leading-[1.05] text-cream-900">{tile.value}</p>
          {tile.sub ? (
            <div className="mt-1.5 text-[11px] leading-[1.35] text-cream-700 [&_.up]:font-semibold [&_.up]:text-success-500 [&_.down]:font-semibold [&_.down]:text-danger-500 [&_.hint]:text-cream-600">
              {tile.sub}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export type { MetaTile, MetaStrip4Props };
