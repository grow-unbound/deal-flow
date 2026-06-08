'use client';

import { Banknote } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { toDatetimeLocalValue } from '@/lib/date-utils';

const METHODS = ['UPI', 'Bank transfer', 'Cheque', 'Cash', 'Other'] as const;

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
  const [amount, setAmount] = useState(String(amountOutstanding));
  const [method, setMethod] = useState<string>(METHODS[0]);

  useEffect(() => {
    if (open) {
      setPaidAtLocal(toDatetimeLocalValue(new Date()));
      setReference('');
      setAmount(String(amountOutstanding));
      setMethod(METHODS[0]);
    }
  }, [open, amountOutstanding]);

  async function handleSubmit() {
    const parsed = new Date(paidAtLocal);
    if (Number.isNaN(parsed.getTime())) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (amt > amountOutstanding + 0.01) return;
    try {
      await onConfirm({
        amount: amt,
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
            <Label className="text-[13px]">Payment method</Label>
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
            <Label htmlFor="inv-pay-ref" className="text-[13px]">
              Payment reference <span className="text-cream-500">(optional)</span>
            </Label>
            <Input id="inv-pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / NEFT ref" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="inv-pay-amt" className="text-[13px]">
                Amount
              </Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setAmount(String(amountOutstanding))}>
                Full amount
              </Button>
            </div>
            <Input id="inv-pay-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" className="gap-2" onClick={() => void handleSubmit()} disabled={isPending || !paidAtLocal}>
            <Banknote className="h-4 w-4" />
            {isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
