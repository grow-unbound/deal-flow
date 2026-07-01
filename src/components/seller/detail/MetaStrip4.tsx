import type { ReactNode } from 'react';
import { InsightStrip4 } from '@/components/seller/layout';

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
    <InsightStrip4
      className="mt-6 mb-0"
      tiles={tiles.map((tile) => ({
        label: tile.label,
        value: tile.value,
        sub: tile.sub,
      }))}
    />
  );
}

export type { MetaTile, MetaStrip4Props };
