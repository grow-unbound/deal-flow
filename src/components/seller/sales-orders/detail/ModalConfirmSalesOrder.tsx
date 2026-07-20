'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { SalesOrderLine } from '@/types/tenant-sales-orders';
import { formatNumberValue } from '@/lib/utils';

function lineTotal(line: SalesOrderLine, qtyOverride?: number) {
  const qty = qtyOverride ?? line.qty;
  const taxPct = line.tax_pct ?? 0;
  const taxable = qty * line.unit_price * (1 - line.disc_pct / 100);
  return taxable + taxable * (taxPct / 100);
}

export function ModalConfirmSalesOrder({
  open,
  onOpenChange,
  orderNumber,
  lines,
  createInvoices,
  isSubmitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  lines: SalesOrderLine[];
  createInvoices: boolean;
  isSubmitting: boolean;
  onConfirm: (input: { qty_overrides: Record<string, number> }) => void;
}) {
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setQtyOverrides({});
  }, [open]);

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const raw = qtyOverrides[l.id];
        const override = raw !== undefined ? parseFloat(raw) : undefined;
        const qty = override && override > 0 ? override : undefined;
        return sum + lineTotal(l, qty);
      }, 0),
    [lines, qtyOverrides],
  );

  function handleSubmit() {
    const overrides: Record<string, number> = {};
    for (const [id, raw] of Object.entries(qtyOverrides)) {
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0) overrides[id] = n;
    }
    onConfirm({ qty_overrides: overrides });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] gap-0 p-0 sm:max-w-[600px]">
        <DialogHeader className="border-b border-cream-200 px-6 pb-4 pt-6">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
                Sales Order · {orderNumber}
              </p>
              <DialogTitle className="mt-1 text-left text-lg font-semibold text-cream-950">
                Confirm this order?
              </DialogTitle>
              <p className="mt-2 text-base leading-relaxed text-cream-700">
                {createInvoices ? (
                  <>
                    Confirming will <strong className="font-medium text-cream-900">reserve stock</strong> and create a{' '}
                    <strong className="font-medium text-cream-900">draft invoice</strong> automatically. Adjust quantities if needed.
                  </>
                ) : (
                  <>
                    Confirming will <strong className="font-medium text-cream-900">reserve stock</strong>. Invoice will be managed in your external system. Adjust quantities if needed.
                  </>
                )}
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 px-6 py-5">
          <div className="overflow-hidden rounded-[12px] border border-cream-300">
            <div className="grid grid-cols-[minmax(0,1fr)_72px_80px_96px_100px] gap-2 border-b border-cream-200 bg-cream-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">
              <span>Product</span>
              <span className="text-right">Ordered</span>
              <span className="text-right">In Stock</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Amount</span>
            </div>
            {lines.map((line) => {
              const overrideStr = qtyOverrides[line.id] ?? '';
              const displayQty = overrideStr !== '' ? overrideStr : String(line.qty);
              const parsedQty = parseFloat(displayQty);
              const effectiveQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : undefined;
              const isShort = line.on_hand < line.qty;
              return (
                <div
                  key={line.id}
                  className="grid grid-cols-[minmax(0,1fr)_72px_80px_96px_100px] items-center gap-2 border-b border-cream-100 px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{line.name}</p>
                    <p className="truncate font-mono text-xs text-cream-600">{line.sku}</p>
                  </div>
                  <p className="text-right text-base tabular-nums text-cream-700">{line.qty}</p>
                  <p className={`text-right text-base tabular-nums ${isShort ? 'font-medium text-amber-700' : 'text-cream-700'}`}>
                    {line.on_hand}
                  </p>
                  <div className="flex justify-end">
                    <Input
                      type="number"
                      min={0.01}
                      step="any"
                      value={displayQty}
                      onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      className="h-7 w-[76px] px-2 text-right text-sm tabular-nums"
                    />
                  </div>
                  <p className="text-right font-mono text-base tabular-nums text-cream-900">
                    {formatNumberValue(lineTotal(line, effectiveQty), 'CURRENCY_EXACT')}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-baseline justify-between rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2.5 text-base">
            <span className="text-cream-700">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
            <span className="font-mono font-medium tabular-nums text-cream-900">{formatNumberValue(total, 'CURRENCY_EXACT')}</span>
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-cream-200 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Back
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            <CheckCircle2 className="h-4 w-4" />
            {isSubmitting ? 'Confirming…' : 'Confirm order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
