'use client';

import type { SalesOrderLine } from '@/types/tenant-sales-orders';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface SalesOrderItemsSectionProps {
  lines: SalesOrderLine[];
  showStock: boolean;
}

export function SalesOrderItemsSection({ lines, showStock }: SalesOrderItemsSectionProps) {
  const taxable = lines.reduce((s, l) => s + l.line_total, 0);
  const igstRate = 0.18;
  const igst = Math.round(taxable * igstRate);
  const total = taxable + igst;

  return (
    <div>
      <div className="divide-y divide-cream-100">
        {lines.map((l) => {
          const short = showStock && l.qty > l.on_hand;
          return (
            <div
              key={l.id}
              className={cn('flex items-start justify-between gap-3 px-5 py-3', short && 'bg-amber-50/60')}
            >
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium text-cream-900">{l.name}</div>
                <div className="text-sm text-cream-600">
                  {l.brand} · {l.sku}
                </div>
                {short ? (
                  <div className="mt-1 text-xs text-amber-800">
                    {l.on_hand} of {l.qty} in stock · {l.qty - l.on_hand} short
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right font-mono text-base text-cream-800">
                {l.qty} × {formatCurrency(l.unit_price)}
              </div>
              <div className="shrink-0 text-right font-display text-base font-semibold text-cream-950">
                {formatCurrency(l.line_total)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-cream-100 px-5 pb-5 pt-4">
        <div className="flex justify-between text-base text-cream-800">
          <span>Taxable value</span>
          <span className="font-mono">{formatCurrency(taxable)}</span>
        </div>
        <div className="mt-1 flex justify-between text-base text-cream-800">
          <span>IGST @ 18%</span>
          <span className="font-mono">{formatCurrency(igst)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-cream-100 pt-2 font-display text-lg font-semibold text-cream-950">
          <span>Order total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
