'use client';

import { useCallback, useState } from 'react';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { cn } from '@/lib/utils';

export function FormOverlay({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('flex h-full w-full max-w-[540px] flex-col border-l border-cream-300 bg-white', className)}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function FormOverlayHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <SheetHeader className="sticky top-0 z-10 flex-shrink-0 border-b border-cream-300 bg-white/95 px-[22px] pt-[18px] pb-4 backdrop-blur-sm">
      <div className="pr-8">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream-700">{eyebrow}</p>
        ) : null}
        <SheetTitle className="font-display text-xl font-medium leading-[1.15] tracking-[-0.01em] text-cream-900">
          {title}
        </SheetTitle>
        {description ? (
          <p className="mt-1.5 text-sm leading-[1.5] text-cream-700">{description}</p>
        ) : null}
      </div>
      {children}
    </SheetHeader>
  );
}

export const FormOverlayBody = SheetBody;
export const FormOverlayFooter = SheetFooter;

export function FormBlock({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-[10px]', className)}>
      {title ? (
        <h3 className="text-base font-semibold tracking-normal text-cream-900">{title}</h3>
      ) : null}
      {children}
    </section>
  );
}

export function FormSectionGrid({
  children,
  columns = 2,
}: {
  children: React.ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn('grid gap-x-3 gap-y-[14px]', columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
      {children}
    </div>
  );
}

export function useDirtyCloseGuard({
  isDirty,
  onConfirmClose,
}: {
  isDirty: boolean;
  onConfirmClose: () => void;
}) {
  const [discardOpen, setDiscardOpen] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        return;
      }

      if (isDirty) {
        setDiscardOpen(true);
        return;
      }

      onConfirmClose();
    },
    [isDirty, onConfirmClose],
  );

  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    onConfirmClose();
  }, [onConfirmClose]);

  return {
    discardOpen,
    setDiscardOpen,
    handleOpenChange,
    confirmDiscard,
  };
}

export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-cream-300 bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-cream-900">Discard changes?</AlertDialogTitle>
          <AlertDialogDescription className="text-base text-cream-700">
            You have unsaved changes in this form. If you leave now, those edits will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-danger-500 hover:bg-danger-600"
            onClick={onDiscard}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
