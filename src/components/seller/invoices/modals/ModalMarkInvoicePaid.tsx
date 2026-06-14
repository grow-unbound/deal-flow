'use client';

import { Banknote } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { roundMoney } from '@/lib/currency-input';
import { toDatetimeLocalValue } from '@/lib/date-utils';
import { formatInrInput, parseInrInput } from '@/lib/utils';

const METHODS = ['UPI', 'Bank transfer', 'Cheque', 'Cash', 'Other'] as const;

function formatInrDecimals(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(amount));
}

export function ModalMarkInvoicePaid({
  open,
  onOpenChange,
  amountOutstanding,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountOutstanding: number;
  isPending: boolean;
  onConfirm: (payload: {
    amount: number;
    payment_method: string;
    payment_reference?: string | null;
    paid_at?: string;
  }) => Promise<void>;
}) {
  const [paidAtLocal, setPaidAtLocal] = useState('');
  const [reference, setReference] = useState('');
  const roundedOutstanding = roundMoney(amountOutstanding);
  const [amount, setAmount] = useState(formatInrInput(String(roundedOutstanding)));
  const [method, setMethod] = useState<string>(METHODS[0]);

  useEffect(() => {
    if (open) {
      setPaidAtLocal(toDatetimeLocalValue(new Date()));
      setReference('');
      setAmount(formatInrInput(String(roundMoney(amountOutstanding))));
      setMethod(METHODS[0]);
    }
  }, [open, amountOutstanding]);

  const parsedAmount = useMemo(() => parseInrInput(amount), [amount]);
  const exceedsDue = parsedAmount != null && parsedAmount > roundedOutstanding + 0.01;
  const canSubmit = Boolean(paidAtLocal) && parsedAmount != null && parsedAmount > 0 && !exceedsDue;

  async function handleSubmit() {
    const parsed = new Date(paidAtLocal);
    if (Number.isNaN(parsed.getTime())) return;
    const amt = parseInrInput(amount);
    if (amt == null || amt <= 0) return;
    if (amt > roundedOutstanding + 0.01) return;
    try {
      await onConfirm({
        amount: roundMoney(amt),
        payment_method: method,
        payment_reference: reference.trim() || undefined,
        paid_at: parsed.toISOString(),
      });
      onOpenChange(false);
    } catch {
      /* parent toast */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark invoice as paid</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <DateTimePicker id="inv-paid-at" label="Paid at" value={paidAtLocal} onChange={setPaidAtLocal} />
          <div className="space-y-2">
            <Label className="text-base">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-pay-ref" className="text-base">
              Payment reference <span className="text-cream-500">(optional)</span>
            </Label>
            <Input id="inv-pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / NEFT ref" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="inv-pay-amt" className="text-base">
                Amount
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAmount(formatInrInput(String(roundedOutstanding)))}
              >
                Full amount
              </Button>
            </div>
            <div className="flex items-stretch">
              <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-3 text-base text-cream-700 select-none">
                ₹
              </span>
              <Input
                id="inv-pay-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(formatInrInput(e.target.value))}
                className="rounded-l-none font-mono tabular-nums tracking-wide"
                aria-invalid={exceedsDue}
                aria-describedby={exceedsDue ? 'inv-pay-amt-warning' : undefined}
              />
            </div>
            {exceedsDue ? (
              <div id="inv-pay-amt-warning" className="callout callout--warning text-sm leading-[1.5]" role="alert">
                Payment exceeds amount due ({formatInrDecimals(roundedOutstanding)}). Use &ldquo;Full amount&rdquo; or enter up to the outstanding balance.
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" className="gap-2" onClick={() => void handleSubmit()} disabled={isPending || !canSubmit}>
            <Banknote className="h-4 w-4" />
            {isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
