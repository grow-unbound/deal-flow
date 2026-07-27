'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';

import { cn } from '@/lib/cn';
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
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { BuyerAppEnablePreviewResponse } from '@/types/buyer-app-enable';

export type BuyerAppAccessConfirmMode = 'enable' | 'disable';

interface BuyerAppAccessConfirmDialogProps {
  open: boolean;
  mode: BuyerAppAccessConfirmMode;
  selectedCount: number;
  singleBuyerLabel: string | null;
  preview: BuyerAppEnablePreviewResponse | null;
  previewLoading: boolean;
  previewError: string | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (skipConfirm: boolean) => void;
}

function enableDescription(selectedCount: number): string {
  if (selectedCount === 1) {
    return 'The enabled buyer will receive the app link via WhatsApp.';
  }
  return 'The enabled buyers will receive the app link via WhatsApp.';
}

function disableDescription(selectedCount: number): string {
  if (selectedCount === 1) {
    return 'The buyer will no longer be able to access the buyer app and will have to contact your team for any orders.';
  }
  return 'These buyers will no longer be able to access the buyer app and will have to contact your team for any orders.';
}

function affectedBuyersLabel(selectedCount: number, singleBuyerLabel: string | null): string {
  if (selectedCount === 1 && singleBuyerLabel) {
    return singleBuyerLabel;
  }
  return `${selectedCount} buyer${selectedCount === 1 ? '' : 's'}`;
}

/** Matches `buildBuyerAppEnabledPreviewMessage` line count for stable dialog height while loading. */
const ENABLE_WHATSAPP_PREVIEW_FOOTPRINT = [
  'Hi Buyer,',
  '',
  'Your distributor has enabled the catalog app for you.',
  '',
  'You can now explore their latest stock, check prices, and place orders anytime.',
].join('\n');

const ENABLE_PREVIEW_PANEL_CLASS =
  'rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800';

const ENABLE_CREDITS_PANEL_MIN_H = 'min-h-[5.25rem]';

function EnablePreviewPanel({
  preview,
  previewLoading,
}: {
  preview: BuyerAppEnablePreviewResponse | null;
  previewLoading: boolean;
}) {
  const isLoading = previewLoading || !preview;

  return (
    <div className={cn(ENABLE_PREVIEW_PANEL_CLASS, 'min-h-[13.5rem]')}>
      <div className="mb-3 min-h-[1.25rem]">
        {isLoading ? (
          <Skeleton className="h-3 w-52" />
        ) : (
          <>
            <span className="text-cream-600">Notifiable buyers: </span>
            {preview.recipient_count} of {preview.selected_count} selected
          </>
        )}
      </div>

      {!isLoading && preview.recipient_count === 0 ? (
        <p className="mb-3 text-cream-600">
          No WhatsApp will be sent — selected buyers need a valid mobile number on file, must not
          already have app access, and must be active on your customer list.
        </p>
      ) : null}

      <p className="mb-2 text-cream-600">Template preview</p>

      <div className="relative min-h-[6.5em]">
        {isLoading ? (
          <>
            <pre
              className="pointer-events-none invisible whitespace-pre-wrap font-sans text-body-sm"
              aria-hidden
            >
              {ENABLE_WHATSAPP_PREVIEW_FOOTPRINT}
            </pre>
            <div className="absolute inset-0 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[92%]" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[88%]" />
              <Skeleton className="h-3 w-[95%]" />
            </div>
          </>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-body-sm text-cream-800">
            {preview.preview_message}
          </pre>
        )}
      </div>
    </div>
  );
}

function EnableCreditsPanel({
  preview,
  previewLoading,
}: {
  preview: BuyerAppEnablePreviewResponse | null;
  previewLoading: boolean;
}) {
  const isLoading = previewLoading || !preview;

  return (
    <div className={cn(ENABLE_PREVIEW_PANEL_CLASS, ENABLE_CREDITS_PANEL_MIN_H)}>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-44" />
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <span className="text-cream-600">WhatsApp credits per buyer: </span>
            {preview.credits_per_buyer}
          </div>
          <div>
            <span className="text-cream-600">Total credits required: </span>
            {preview.total_credits}
          </div>
          <div>
            <span className="text-cream-600">Credits available: </span>
            {preview.credits_balance}
          </div>
        </div>
      )}
    </div>
  );
}

export function BuyerAppAccessConfirmDialog({
  open,
  mode,
  selectedCount,
  singleBuyerLabel,
  preview,
  previewLoading,
  previewError,
  isPending,
  onOpenChange,
  onConfirm,
}: BuyerAppAccessConfirmDialogProps) {
  const [skipConfirm, setSkipConfirm] = useState(false);

  useEffect(() => {
    if (!open) {
      setSkipConfirm(false);
    }
  }, [open]);

  const isEnable = mode === 'enable';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent
        className={cn(
          'border-cream-200 bg-cream-50',
          isEnable && 'max-w-lg',
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-cream-900">
            {isEnable ? 'Enable buyer app access?' : 'Disable buyer app access?'}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-cream-700">
            {isEnable ? enableDescription(selectedCount) : disableDescription(selectedCount)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-md border border-cream-300 bg-white p-4 text-body-sm text-cream-800">
            <div>
              <span className="text-cream-600">Affected buyers: </span>
              {affectedBuyersLabel(selectedCount, singleBuyerLabel)}
            </div>
          </div>

          {isEnable ? (
            <>
              {previewError ? (
                <Alert variant="danger">
                  <AlertDescription>{previewError}</AlertDescription>
                </Alert>
              ) : null}

              <EnablePreviewPanel preview={preview} previewLoading={previewLoading} />
              <EnableCreditsPanel preview={preview} previewLoading={previewLoading} />
            </>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-cream-700">
            <Checkbox
              checked={skipConfirm}
              onCheckedChange={(checked) => setSkipConfirm(checked === true)}
              aria-label="Don't show me again"
            />
            Don&apos;t show me again
          </label>
        </DialogBody>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={
              isPending
              || (isEnable && (previewLoading || !preview || Boolean(previewError)))
            }
            onClick={(event) => {
              event.preventDefault();
              onConfirm(skipConfirm);
            }}
          >
            <MessageCircle className="h-4 w-4" />
            {isPending
              ? (isEnable ? 'Enabling…' : 'Disabling…')
              : (isEnable ? 'Enable access' : 'Disable access')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
