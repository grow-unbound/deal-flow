import * as React from 'react';
import { cn } from '@/lib/utils';

type StockStatus = 'available' | 'limited' | 'out_of_stock' | string;

interface StockBadgeProps {
  status: StockStatus;
}

const CONFIG: Record<string, { label: string; className: string }> = {
  available: {
    label: 'In Stock',
    className: 'bg-[var(--success-50)] text-[var(--success-500)]',
  },
  limited: {
    label: 'Limited',
    className: 'bg-[var(--warning-50)] text-[var(--warning-500)]',
  },
  out_of_stock: {
    label: 'Out of Stock',
    className: 'bg-[var(--danger-50)] text-[var(--danger-500)]',
  },
};

export function StockBadge({ status }: StockBadgeProps) {
  const config = CONFIG[status] ?? CONFIG['available'];

  return (
    <span
      className={cn(
        'inline-flex items-center text-xs rounded-full px-2 py-0.5 font-medium',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
