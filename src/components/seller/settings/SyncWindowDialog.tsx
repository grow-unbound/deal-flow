'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

export interface SyncConfirmOptions {
  since: string | null;
  forceFullRefresh: boolean;
}

interface SyncWindowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: SyncConfirmOptions) => void;
  title: string;
  description: string;
  confirmLabel: string;
}

function toDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SyncWindowDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
}: SyncWindowDialogProps) {
  const [forceFullRefresh, setForceFullRefresh] = useState(false);
  const [sinceDate, setSinceDate] = useState('');

  useEffect(() => {
    if (open) {
      setForceFullRefresh(false);
      setSinceDate(toDateOnly(new Date()));
    }
  }, [open]);

  const canConfirm = !forceFullRefresh || sinceDate.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-cream-200 bg-white">
        <DialogHeader>
          <DialogTitle className="font-display text-cream-900">{title}</DialogTitle>
          <DialogDescription className="text-cream-700">{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-4 py-4">
            <p className="text-sm font-semibold text-cream-900">Pick up from last sync (default)</p>
            <p className="mt-1 text-sm leading-6 text-cream-700">
              Only syncs what's changed since each phase's last successful run — fast, and safe to run any time.
              Anything already up to date is skipped automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-cream-200 bg-white px-4 py-4">
            <Switch
              checked={forceFullRefresh}
              onCheckedChange={setForceFullRefresh}
              label="Full historical refresh instead"
            />
            {forceFullRefresh ? (
              <div className="mt-3 space-y-3">
                <DatePicker
                  id="sync-since-date"
                  label="Sync everything from"
                  value={sinceDate}
                  onChange={setSinceDate}
                  maxDate={new Date()}
                  mode="overlay"
                  showSummary={false}
                  triggerClassName="h-[42px] rounded-[10px] border border-cream-400 bg-[var(--bg-surface)] px-3.5 text-base text-cream-900 shadow-[inset_0_1px_0_rgba(20,40,35,0.02)] transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:border-[#B5642F] focus-visible:ring-2 focus-visible:ring-[#B5642F]/20 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-50"
                />
                <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Re-fetches everything from this date regardless of what&apos;s already synced — this can take up to 30 minutes depending on data volume.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm({
                since: forceFullRefresh ? sinceDate : null,
                forceFullRefresh,
              });
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
