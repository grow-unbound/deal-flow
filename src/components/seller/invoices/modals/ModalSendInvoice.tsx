'use client';

import { MessageCircle } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCompactInr } from '@/lib/utils';

function defaultReminderMessage(docNumber: string, grandTotal: number, dueDate: string | null): string {
  const due = dueDate ? ` on ${dueDate}` : '';
  return `Hi — friendly reminder: invoice ${docNumber} for ${formatCompactInr(grandTotal)} is due${due}. Please let us know once payment is arranged. Thank you.`;
}

export function ModalSendInvoice({
  open,
  onOpenChange,
  docNumber,
  grandTotal,
  dueDateYmd,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docNumber: string;
  grandTotal: number;
  dueDateYmd: string | null;
  isPending: boolean;
  onConfirm: (payload: { message: string }) => Promise<void>;
}) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      setMessage(defaultReminderMessage(docNumber, grandTotal, dueDateYmd));
    }
  }, [open, docNumber, grandTotal, dueDateYmd]);

  async function handleSubmit() {
    try {
      await onConfirm({ message: message.trim() });
      onOpenChange(false);
    } catch {
      /* parent toast */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send payment reminder</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Label htmlFor="remind-msg" className="text-base">
            Message
          </Label>
          <Textarea id="remind-msg" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="text-base" />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" className="gap-2" onClick={() => void handleSubmit()} disabled={isPending || !message.trim()}>
            <MessageCircle className="h-4 w-4" />
            {isPending ? 'Sending…' : 'Send reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
