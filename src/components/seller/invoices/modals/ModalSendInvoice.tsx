'use client';

import { MessageCircle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DialogBody } from '@/components/ui/dialog';
import type { WhatsAppInvoiceReminderState } from '@/types/whatsapp-document-send';

export function ModalSendInvoice({
  open,
  onOpenChange,
  buyerName,
  reminderState,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerName: string;
  reminderState: WhatsAppInvoiceReminderState;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  async function handleSubmit() {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      /* parent toast */
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="bg-cream-50 border-cream-200">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-cream-900">
            Send payment reminder
          </AlertDialogTitle>
          <AlertDialogDescription className="text-cream-700">
            This sends the `buyer_payment_reminder` WhatsApp template to this buyer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DialogBody className="space-y-4">
          {!reminderState.can_send && reminderState.block_message ? (
            <Alert variant={reminderState.block_reason === 'insufficient_credits' ? 'warning' : 'danger'}>
              <AlertDescription>{reminderState.block_message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2 rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
            <div>
              <span className="text-cream-600">Buyer Name: </span>
              {buyerName}
            </div>
            <div>
              <span className="text-cream-600">Phone Number: </span>
              {reminderState.recipient_phone ? `+91 ${reminderState.recipient_phone}` : '—'}
            </div>
            <div>
              <span className="text-cream-600">Outstanding Amount: </span>
              ₹{reminderState.outstanding_amount}
            </div>
            <div>
              <span className="text-cream-600">Due invoice count: </span>
              {reminderState.due_invoice_count}
            </div>
            <div>
              <span className="text-cream-600">Due status: </span>
              {reminderState.due_status || '—'}
            </div>
          </div>

          <div className="rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
            <p className="mb-2 text-cream-600">Template preview</p>
            <pre className="whitespace-pre-wrap font-sans text-body-sm text-cream-800">
              {reminderState.preview_message}
            </pre>
          </div>

          <div className="rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
            <div>
              <span className="text-cream-600">WhatsApp credits required: </span>
              {reminderState.required_credits}
            </div>
            <div>
              <span className="text-cream-600">Credits available: </span>
              {reminderState.credits_balance}
            </div>
          </div>
        </DialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || !reminderState.can_send}
            onClick={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <MessageCircle className="h-4 w-4" />
            {isPending ? 'Sending…' : 'Send reminder'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
