'use client';

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
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Label } from '@/components/ui/label';
import { toDatetimeLocalValue } from '@/lib/date-utils';

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAmount: number;
  onSubmit: (payload: { paid_at: string; payment_reference?: string; amount?: number }) => Promise<void>;
  isPending: boolean;
}

export function RecordPaymentModal({
  open,
  onOpenChange,
  defaultAmount,
  onSubmit,
  isPending,
}: RecordPaymentModalProps) {
  const [paidAtLocal, setPaidAtLocal] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(String(defaultAmount));

  useEffect(() => {
    if (open) {
      setPaidAtLocal(toDatetimeLocalValue(new Date()));
      setReference('');
      setAmount(String(defaultAmount));
    }
  }, [open, defaultAmount]);

  async function handleSubmit() {
    const parsed = new Date(paidAtLocal);
    if (Number.isNaN(parsed.getTime())) return;
    const amt = Number(amount);
    try {
      await onSubmit({
        paid_at: parsed.toISOString(),
        payment_reference: reference.trim() || undefined,
        amount: Number.isFinite(amt) ? amt : undefined,
      });
      onOpenChange(false);
    } catch {
      /* parent surfaces toast */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <DateTimePicker
            id="paid-at"
            label="Paid at"
            value={paidAtLocal}
            onChange={setPaidAtLocal}
          />
          <div className="space-y-2">
            <Label htmlFor="pay-ref" className="text-base">
              Payment reference <span className="text-cream-500">(optional)</span>
            </Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI / NEFT ref"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-amt" className="text-base">
              Amount
            </Label>
            <Input id="pay-amt" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending || !paidAtLocal}>
            {isPending ? 'Saving…' : 'Mark paid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
