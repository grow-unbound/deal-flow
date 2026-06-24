'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SYNC_WINDOW_OPTIONS, type SyncWindowId } from '@/lib/integrations/sync-window';

interface SyncWindowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (windowId: SyncWindowId) => void;
  title: string;
  description: string;
  confirmLabel: string;
  defaultWindow?: SyncWindowId;
}

export function SyncWindowDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  defaultWindow = 'financial_year_to_date',
}: SyncWindowDialogProps) {
  const [selectedWindow, setSelectedWindow] = useState<SyncWindowId>(defaultWindow);

  useEffect(() => {
    if (open) {
      setSelectedWindow(defaultWindow);
    }
  }, [defaultWindow, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-cream-200 bg-white">
        <DialogHeader>
          <DialogTitle className="font-display text-cream-900">{title}</DialogTitle>
          <DialogDescription className="text-cream-700">{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {SYNC_WINDOW_OPTIONS.map((option) => {
            const selected = option.id === selectedWindow;
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors',
                  selected
                    ? 'border-teal-300 bg-teal-50/70 shadow-xs'
                    : 'border-cream-200 bg-white hover:border-teal-200 hover:bg-teal-50/40',
                )}
                onClick={() => setSelectedWindow(option.id)}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    selected ? 'border-teal-500 bg-teal-500 text-white' : 'border-cream-300 bg-white text-transparent',
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-cream-900">{option.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-cream-600">{option.description}</span>
                </span>
              </button>
            );
          })}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onConfirm(selectedWindow);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
