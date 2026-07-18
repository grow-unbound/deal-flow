import type { ReactNode } from 'react';
import { MetricGrid } from './MetricGrid';

interface MetaTile {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  deltaTone?: 'up' | 'down' | 'neutral';
  tone?: 'accent' | 'warn';
}

interface MetaStrip4Props {
  tiles: MetaTile[];
  showSupportingText?: boolean;
}

export function MetaStrip4({ tiles, showSupportingText = true }: MetaStrip4Props) {
  return <MetricGrid className="mt-6 mb-0" tiles={tiles} showSupportingText={showSupportingText} />;
}

export type { MetaTile, MetaStrip4Props };
