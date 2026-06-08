'use client';

import { Ban } from 'lucide-react';
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
import { Label } from '@/components/ui/label';

export function ModalVoidInvoice({
  open,
  onOpenChange,
  confirmToken,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. INV-42 — user must type this exactly */
  confirmToken: string;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open, confirmToken]);

  const match = typed.trim() === confirmToken.trim();

  async function handleSubmit() {
    if (!match) return;
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      /* parent toast */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void invoice</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-[13px] text-cream-700">
            This cannot be undone. Type <span className="font-mono font-semibold text-cream-900">{confirmToken}</span> to confirm.
          </p>
          <div className="space-y-2">
            <Label htmlFor="void-confirm" className="text-[13px]">
              Confirmation
            </Label>
            <Input id="void-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" autoComplete="off" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="gap-2" disabled={!match || isPending} onClick={() => void handleSubmit()}>
            <Ban className="h-4 w-4" />
            {isPending ? 'Voiding…' : 'Void invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
