'use client';

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
import { Textarea } from '@/components/ui/textarea';

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  isPending: boolean;
}

export function CancelOrderDialog({ open, onOpenChange, onConfirm, isPending }: CancelOrderDialogProps) {
  const [reason, setReason] = useState('');

  async function handleSubmit() {
    const trimmed = reason.trim();
    if (!trimmed) return;
    try {
      await onConfirm(trimmed);
      setReason('');
      onOpenChange(false);
    } catch {
      /* parent toast; keep dialog open */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel order</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-base text-cream-700">
            This will cancel the order before dispatch. Please provide a reason for your records.
          </p>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-base">
              Reason <span className="text-danger-600">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Buyer requested cancellation"
              rows={3}
              className="resize-none"
            />
          </div>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Back
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || reason.trim().length === 0}
            onClick={() => void handleSubmit()}
          >
            {isPending ? 'Cancelling…' : 'Confirm cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
