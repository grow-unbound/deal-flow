'use client';

import { Truck } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ModalDispatch({
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
  onConfirm: (payload: { carrier?: string; notes?: string }) => void;
}) {
  const [carrier, setCarrier] = useState('');
  const [notes, setNotes] = useState('');

  function handleSubmit() {
    onConfirm({ carrier: carrier.trim() || undefined, notes: notes.trim() || undefined });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setCarrier('');
          setNotes('');
        }
      }}
    >
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" aria-hidden />
            Dispatch {orderNumber}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dispatch-carrier">Carrier</Label>
            <Input
              id="dispatch-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g. BlueDart"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatch-notes">Dispatch notes</Label>
            <Textarea
              id="dispatch-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for the audit trail"
              rows={3}
              maxLength={2000}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" className="gap-2" disabled={isPending} onClick={handleSubmit}>
            <Truck className="h-4 w-4" />
            {isPending ? 'Dispatching…' : 'Confirm dispatch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
