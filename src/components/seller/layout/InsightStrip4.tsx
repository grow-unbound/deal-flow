import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { MetricGrid } from '@/components/seller/detail/MetricGrid';

interface InsightTile {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: string;
  deltaTone?: 'up' | 'down';
  tone?: 'accent' | 'warn';
}

interface InsightStrip4Props {
  tiles: InsightTile[];
  className?: string;
  showSupportingText?: boolean;
}

export function InsightStrip4({ tiles, className, showSupportingText = false }: InsightStrip4Props) {
  return (
    <MetricGrid
      className={cn('mt-5 mb-0', className)}
      tiles={tiles}
      showSupportingText={showSupportingText}
    />
  );
}

export type { InsightTile };
