'use client';

import { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { setSkipConfirm } from '@/lib/inbox/inbox-confirm-prefs';

interface InboxConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tenantId: string;
  actionKey: string;
  onConfirm: () => void;
}

export function InboxConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tenantId,
  actionKey,
  onConfirm,
}: InboxConfirmDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 py-2">
          <Checkbox
            id={`inbox-skip-confirm-${actionKey}`}
            checked={dontAskAgain}
            onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            label="Don't ask me again on this device"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (dontAskAgain) setSkipConfirm(tenantId, actionKey);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
