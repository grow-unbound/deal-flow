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

export function InsightStrip4({ tiles, className, showSupportingText = true }: InsightStrip4Props) {
  return (
    <MetricGrid
      className={cn('mt-4 mb-0 grid-cols-2 gap-2 md:mt-5 md:gap-3', className)}
      tiles={tiles}
      showSupportingText={showSupportingText}
      cardClassName="max-md:min-h-[96px] max-md:px-3 max-md:py-3"
    />
  );
}

export type { InsightTile };
