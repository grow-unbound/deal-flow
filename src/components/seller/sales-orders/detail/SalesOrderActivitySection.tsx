'use client';

import {
  AlertTriangle,
  Check,
  Home,
  Pencil,
  ShoppingCart,
  Truck,
  X,
} from 'lucide-react';
import type { SalesOrderActivityRow } from '@/types/tenant-sales-orders';
import { cn } from '@/lib/utils';

interface SalesOrderActivitySectionProps {
  rows: SalesOrderActivityRow[];
}

function ActivityIcon({ row }: { row: SalesOrderActivityRow }) {
  const base = 'h-3 w-3';
  switch (row.kind) {
    case 'placed':
      return <ShoppingCart className={base} aria-hidden />;
    case 'line_edited':
      return <Pencil className={base} aria-hidden />;
    case 'confirmed':
      return <Check className={cn(base, 'text-teal-600')} aria-hidden />;
    case 'short_stock':
      return <AlertTriangle className={cn(base, 'text-amber-600')} aria-hidden />;
    case 'dispatched':
      return <Truck className={base} aria-hidden />;
    case 'delivered':
      return <Home className={cn(base, 'text-teal-600')} aria-hidden />;
    case 'payment_received':
      return <Check className={cn(base, 'text-teal-600')} aria-hidden />;
    case 'cancelled':
      return <X className={cn(base, 'text-danger-600')} aria-hidden />;
    default:
      return <Pencil className={base} aria-hidden />;
  }
}

export function SalesOrderActivitySection({ rows }: SalesOrderActivitySectionProps) {
  return (
    <div className="divide-y divide-cream-100">
      {rows.map((row) => (
        <div key={row.id} className="flex gap-3 px-5 py-3">
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cream-100">
            <ActivityIcon row={row} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-cream-900">{row.title}</div>
            <div className="mt-0.5 text-[12px] text-cream-700">{row.detail}</div>
            <div className="mt-1 text-[11px] text-cream-500">
              {row.who} · {row.at}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
