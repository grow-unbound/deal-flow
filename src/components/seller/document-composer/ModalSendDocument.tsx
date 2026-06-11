'use client';

import { Download, Loader2, Mail, MessageCircle, Send } from 'lucide-react';
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
import { formatCompactInr } from '@/lib/utils';
import type { EstimateSendChannel } from '@/types/estimate-composer';

export function ModalSendDocument({
  open,
  onOpenChange,
  title,
  recipientDefault,
  messageDefault,
  lineCount,
  grandTotal,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  recipientDefault: string;
  messageDefault: string;
  lineCount: number;
  grandTotal: number;
  isPending: boolean;
  onConfirm: (payload: { channel: EstimateSendChannel; recipient: string; message: string }) => void | Promise<void>;
}) {
  const [sendChannel, setSendChannel] = useState<EstimateSendChannel>('whatsapp');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setSendRecipient(recipientDefault);
    setSendMessage(messageDefault);
    setSendChannel('whatsapp');
  }, [messageDefault, open, recipientDefault]);

  async function handleSubmit() {
    await onConfirm({
      channel: sendChannel,
      recipient: sendRecipient,
      message: sendMessage,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex gap-2">
            {(['whatsapp', 'email', 'download'] as EstimateSendChannel[]).map((channel) => (
              <Button
                key={channel}
                type="button"
                variant={sendChannel === channel ? 'primary' : 'outline'}
                size="sm"
                className="gap-2"
                disabled={isPending}
                onClick={() => setSendChannel(channel)}
              >
                {channel === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : null}
                {channel === 'email' ? <Mail className="h-4 w-4" /> : null}
                {channel === 'download' ? <Download className="h-4 w-4" /> : null}
                {channel === 'download' ? 'Download only' : channel[0].toUpperCase() + channel.slice(1)}
              </Button>
            ))}
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-[12px] font-medium text-cream-800">Recipient</p>
              <Input value={sendRecipient} onChange={(event) => setSendRecipient(event.target.value)} disabled={isPending} />
            </div>
            <div>
              <p className="mb-2 text-[12px] font-medium text-cream-800">Message</p>
              <textarea
                value={sendMessage}
                onChange={(event) => setSendMessage(event.target.value)}
                disabled={isPending}
                className="min-h-[120px] w-full rounded-[12px] border border-cream-300 px-3 py-2 text-[13px] outline-none disabled:opacity-60"
              />
            </div>
            <div className="rounded-[12px] border border-cream-200 bg-cream-50 p-3 text-[12px] text-cream-700">
              Buyer sees {lineCount} lines totaling {formatCompactInr(grandTotal)}.
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="gap-2" disabled={isPending || !sendRecipient.trim() || !sendMessage.trim()} onClick={() => void handleSubmit()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isPending ? 'Sending…' : 'Send now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
