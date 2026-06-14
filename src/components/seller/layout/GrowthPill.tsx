import { cn } from '@/lib/utils';

interface GrowthPillProps {
  value: number;
  className?: string;
}

export function GrowthPill({ value, className }: GrowthPillProps) {
  if (value > 0) {
    return <span className={cn('font-mono text-base font-semibold text-success-500', className)}>{`↑ +${value}%`}</span>;
  }

  if (value < 0) {
    return <span className={cn('font-mono text-base font-semibold text-danger-500', className)}>{`↓ ${Math.abs(value)}%`}</span>;
  }

  return <span className={cn('text-sm text-cream-600', className)}>· flat</span>;
}
