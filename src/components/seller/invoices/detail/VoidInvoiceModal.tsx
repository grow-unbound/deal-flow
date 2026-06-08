'use client';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface VoidInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
}

export function VoidInvoiceModal({ open, onOpenChange, onConfirm, isPending }: VoidInvoiceModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Void invoice</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-cream-700">This action cannot be undone.</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? 'Voiding…' : 'Confirm void'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
