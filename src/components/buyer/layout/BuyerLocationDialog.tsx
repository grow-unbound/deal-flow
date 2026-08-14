'use client';

import { Store } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BuyerLocationPickerBody } from '@/components/buyer/layout/BuyerLocationPickerBody';
import { useBuyerMe } from '@/hooks/useBuyerMe';

interface BuyerLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: string;
}

export function BuyerLocationDialog({ open, onOpenChange, returnTo }: BuyerLocationDialogProps) {
  const { data: meData } = useBuyerMe();
  const tenantDisplayName = meData?.tenant.name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
            {tenantDisplayName ? `Select ${tenantDisplayName} outlet to order from` : 'Select outlet to order from'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <BuyerLocationPickerBody returnTo={returnTo} mode="dialog" onDone={() => onOpenChange(false)} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
