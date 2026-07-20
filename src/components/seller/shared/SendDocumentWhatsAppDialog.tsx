'use client';

import { MessageCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { DialogBody } from '@/components/ui/dialog';
import { formatNumberValue } from '@/lib/utils';
import type { WhatsAppDocumentSendState } from '@/types/whatsapp-document-send';

interface SendDocumentWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  isPending: boolean;
  sendState: WhatsAppDocumentSendState;
  buyerName: string;
  phoneNumber: string | null;
  documentNumberLabel: string;
  documentNumber: string;
  amount: number;
  itemCount: number;
  onConfirm: () => void;
}

export function SendDocumentWhatsAppDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  isPending,
  sendState,
  buyerName,
  phoneNumber,
  documentNumberLabel,
  documentNumber,
  amount,
  itemCount,
  onConfirm,
}: SendDocumentWhatsAppDialogProps) {
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
          <AlertDialogTitle className="font-display text-cream-900">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-cream-700">
            This sends a buyer-facing WhatsApp message with a link to view the document.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DialogBody className="space-y-4">
          {!sendState.can_send && sendState.block_message ? (
            <Alert variant={sendState.block_reason === 'insufficient_credits' ? 'warning' : 'danger'}>
              <AlertDescription>{sendState.block_message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2 rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
            <div>
              <span className="text-cream-600">Buyer Name: </span>
              {buyerName}
            </div>
            <div>
              <span className="text-cream-600">Phone Number: </span>
              {phoneNumber ? `+91 ${phoneNumber}` : '—'}
            </div>
            <div>
              <span className="text-cream-600">{documentNumberLabel}: </span>
              {documentNumber}
            </div>
            <div>
              <span className="text-cream-600">Amount: </span>
              {formatNumberValue(amount, 'CURRENCY_EXACT')}
            </div>
            <div>
              <span className="text-cream-600">Item count: </span>
              {itemCount}
            </div>
          </div>

          <div className="rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
            <div>
              <span className="text-cream-600">WhatsApp credits required: </span>
              {sendState.required_credits}
            </div>
            <div>
              <span className="text-cream-600">Credits available: </span>
              {sendState.credits_balance}
            </div>
          </div>
        </DialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || !sendState.can_send}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            <MessageCircle size={16} />
            {isPending ? 'Sending…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
