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

interface ViewReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string | null;
}

export function ViewReasonDialog({ open, onOpenChange, reason }: ViewReasonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancellation reason</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="whitespace-pre-wrap text-base text-cream-800">{reason?.trim() || 'No reason recorded.'}</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
