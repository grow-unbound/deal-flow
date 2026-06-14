'use client';

import { ArrowRightCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { EstimateComposerLineInput } from '@/types/estimate-composer';
import { formatCompactInr } from '@/lib/utils';

function lineAmount(line: Pick<EstimateComposerLineInput, 'qty' | 'unit_price' | 'disc_pct' | 'tax_pct'>) {
  const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
  return taxable + taxable * (line.tax_pct / 100);
}

export function ModalConvertEstimateToSO({
  open,
  onOpenChange,
  estimateNumber,
  buyerName,
  lines,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateNumber: string;
  buyerName: string;
  lines: EstimateComposerLineInput[];
  onConfirm: (input: { line_ids: string[]; delivery_date: string; order_number?: string }) => void;
  isSubmitting: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [deliveryDate, setDeliveryDate] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const line of lines) {
      next[line.id] = true;
    }
    setSelected(next);
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setDeliveryDate(d.toISOString().slice(0, 10));
    setOrderNumber('');
  }, [open, lines]);

  const included = useMemo(() => lines.filter((line) => selected[line.id]), [lines, selected]);
  const total = useMemo(() => included.reduce((sum, line) => sum + lineAmount(line), 0), [included]);

  function toggle(lineId: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [lineId]: checked }));
  }

  function handleSubmit() {
    const line_ids = lines.filter((line) => selected[line.id]).map((line) => line.id);
    if (line_ids.length === 0 || !deliveryDate) return;
    onConfirm({
      line_ids,
      delivery_date: deliveryDate,
      order_number: orderNumber.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] gap-0 p-0 sm:max-w-[600px]">
        <DialogHeader className="border-b border-cream-200 px-6 pb-4 pt-6">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <ArrowRightCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
                From estimate · {estimateNumber}
              </p>
              <DialogTitle className="mt-1 text-left text-lg font-semibold text-cream-950">
                Convert to sales order
              </DialogTitle>
              <p className="mt-2 text-base leading-relaxed text-cream-700">
                Confirms the order with <strong className="font-medium text-cream-900">{buyerName}</strong> from the
                selected lines. Lines not selected remain on the estimate until you convert or edit them.
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 px-6 py-5">
          <div className="overflow-hidden rounded-[12px] border border-cream-300">
            <div className="grid grid-cols-[40px_minmax(0,1fr)_72px_96px] gap-2 border-b border-cream-200 bg-cream-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">
              <span />
              <span>Product</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Amount</span>
            </div>
            {lines.map((line) => {
              const on = Boolean(selected[line.id]);
              return (
                <div
                  key={line.id}
                  className={`grid grid-cols-[40px_minmax(0,1fr)_72px_96px] items-center gap-2 border-b border-cream-100 px-3 py-2 last:border-b-0 ${on ? '' : 'opacity-50'}`}
                >
                  <Checkbox checked={on} onCheckedChange={(v) => toggle(line.id, v === true)} aria-label={`Include ${line.product_name}`} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-cream-900">{line.product_name}</p>
                    <p className="truncate font-mono text-xs text-cream-600">{line.sku}</p>
                  </div>
                  <p className="text-right text-base tabular-nums text-cream-800">{line.qty}</p>
                  <p className="text-right font-mono text-base tabular-nums text-cream-900">{formatCompactInr(lineAmount(line))}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-cream-800">Expected delivery</p>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="h-10" />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-cream-800">SO number (optional)</p>
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="h-10 font-mono text-base"
                placeholder="Auto-generate if empty"
              />
            </div>
          </div>

          <div className="flex items-baseline justify-between rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2.5 text-base">
            <span className="text-cream-700">
              {included.length} of {lines.length} lines
            </span>
            <span className="font-mono font-medium tabular-nums text-cream-900">{formatCompactInr(total)}</span>
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-cream-200 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={isSubmitting || included.length === 0 || !deliveryDate}
            onClick={handleSubmit}
          >
            <ArrowRightCircle className="h-4 w-4" />
            Create sales order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
