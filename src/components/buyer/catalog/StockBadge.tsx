import * as React from 'react';
import { cn } from '@/lib/utils';

type StockStatus = 'available' | 'limited' | 'out_of_stock' | string;

interface StockBadgeProps {
  status: StockStatus;
}

const CONFIG: Record<string, { label: string; className: string }> = {
  available: {
    label: 'In Stock',
    className: 'border-[var(--success-50)] bg-[var(--success-50)] text-[var(--success-500)]',
  },
  limited: {
    label: 'Limited',
    className: 'border-[var(--warning-50)] bg-[var(--warning-50)] text-[var(--warning-500)]',
  },
  out_of_stock: {
    label: 'Out of Stock',
    className: 'border-[var(--danger-50)] bg-[var(--danger-50)] text-[var(--danger-500)]',
  },
};

export function StockBadge({ status }: StockBadgeProps) {
  const config = CONFIG[status] ?? CONFIG['available'];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-[0.08em]',
        config.className,
      )}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
