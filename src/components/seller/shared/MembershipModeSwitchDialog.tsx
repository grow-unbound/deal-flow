'use client';

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

export type MembershipModeSwitchDirection = 'to_automatic' | 'to_manual';

const COPY: Record<MembershipModeSwitchDirection, { title: string; description: (count: number) => string; confirmLabel: string }> = {
  to_automatic: {
    title: 'Switch to Automatic?',
    description: (count) =>
      count > 0
        ? `This will discard your ${count} manually-selected member${count === 1 ? '' : 's'} and replace them with whoever matches your filters.`
        : 'Membership will now be computed from filters instead of manual picks.',
    confirmLabel: 'Switch to Automatic',
  },
  to_manual: {
    title: 'Switch to Manual?',
    description: (count) =>
      count > 0
        ? `This will freeze the current ${count} automatically-matched member${count === 1 ? '' : 's'} as a static list. They will no longer update as data changes.`
        : 'Membership will be frozen as a static list you edit by hand.',
    confirmLabel: 'Switch to Manual',
  },
};

export function MembershipModeSwitchDialog({
  open,
  onOpenChange,
  direction,
  affectedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: MembershipModeSwitchDirection;
  affectedCount: number;
  onConfirm: () => void;
}) {
  const copy = COPY[direction];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-cream-300 bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-cream-900">{copy.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base text-cream-700">
            {copy.description(affectedCount)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{copy.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
