'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CancelSalesOrderBody } from '@/types/tenant-sales-orders';

const REASON_LABELS: Record<CancelSalesOrderBody['reason'], string> = {
  buyer_requested: 'Buyer requested',
  stock_unavailable: 'Stock unavailable',
  pricing_dispute: 'Pricing dispute',
  duplicate: 'Duplicate order',
  other: 'Other',
};

export function ModalCancelOrder({
  open,
  onOpenChange,
  orderNumber,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  isPending: boolean;
  onConfirm: (payload: CancelSalesOrderBody) => void;
}) {
  const [reason, setReason] = useState<CancelSalesOrderBody['reason']>('buyer_requested');
  const [notes, setNotes] = useState('');

  function handleSubmit() {
    onConfirm({ reason, notes: notes.trim() || undefined });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReason('buyer_requested');
          setNotes('');
        }
      }}
    >
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <X className="h-4 w-4" aria-hidden />
            Cancel {orderNumber}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as CancelSalesOrderBody['reason'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REASON_LABELS) as CancelSalesOrderBody['reason'][]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {REASON_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cancel-notes">Notes</Label>
            <Textarea
              id="cancel-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context"
              rows={3}
              maxLength={2000}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Back
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleSubmit}>
            {isPending ? 'Cancelling…' : 'Cancel order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
