'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useApplyGenericEntryAction } from '@/hooks/useInboxEntries';
import { shouldSkipConfirm } from '@/lib/inbox/inbox-confirm-prefs';
import { InboxConfirmDialog } from './InboxConfirmDialog';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

export const GENERIC_ACTIONS = new Set(['remind_later', 'add_note', 'dismiss', 'reopen']);

export const ACTION_LABELS: Record<string, string> = {
  approve: 'Approve',
  request_more_info: 'Request more info',
  decline: 'Decline',
  view_details: 'View details',
  view_buyer: 'View buyer',
  add_note: 'Add note',
  view_activity: 'View activity',
  ignore: 'Ignore',
  reply_quote: 'Reply / Quote',
  send: 'Send',
  convert: 'Convert',
  contact_buyer: 'Contact buyer',
  view_enquiry: 'View enquiry',
  view_buyer_history: 'View buyer history',
  mark_converted_manually: 'Mark as converted',
  remind_later: 'Remind later',
  accept_order: 'Accept order',
  reject: 'Reject',
  view_order: 'View order',
  mark_dispatched: 'Mark dispatched',
  send_reminder: 'Send reminder',
  view_invoice: 'View invoice',
  log_call: 'Log a call',
  hold_new_orders: 'Hold new orders',
  adjust_limit: 'Adjust limit',
  view_account: 'View account',
  reopen: 'Reopen',
};

export const DESTRUCTIVE_ACTIONS: Record<string, { title: string; description: (entry: InboxEntry) => string; confirmLabel: string }> = {
  decline: {
    title: 'Decline this account?',
    description: (entry) => `${entry.buyer_name} will not be approved. You can reconsider later from Resolved.`,
    confirmLabel: 'Decline',
  },
  reject: {
    title: 'Reject this order?',
    description: (entry) => `${entry.buyer_name}'s order will be rejected and they'll be notified.`,
    confirmLabel: 'Reject',
  },
};

const REMIND_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

interface InboxActionBarProps {
  entry: InboxEntry;
  tenantId: string;
  applyLocalAction: (
    entry: InboxEntry,
    action: string,
    opts?: { note?: string; nextStatus?: InboxEntryStatus; nextSummary?: string },
  ) => void;
}

export function InboxActionBar({ entry, tenantId, applyLocalAction }: InboxActionBarProps) {
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [remindPickerOpen, setRemindPickerOpen] = useState(false);
  const applyGenericAction = useApplyGenericEntryAction();

  function runLocalAction(action: string) {
    applyLocalAction(entry, action, { nextStatus: 'resolved', nextSummary: `${ACTION_LABELS[action] ?? action} done` });
  }

  async function runGenericAction(action: string, remindAt?: string) {
    try {
      await applyGenericAction.mutateAsync({ entryId: entry.id, action: action as 'remind_later' | 'dismiss' | 'reopen' | 'add_note', remind_at: remindAt });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update this item');
    }
  }

  function handleActionClick(action: string) {
    if (action === 'remind_later') {
      setRemindPickerOpen(true);
      return;
    }
    if (GENERIC_ACTIONS.has(action)) {
      void runGenericAction(action);
      return;
    }
    if (DESTRUCTIVE_ACTIONS[action] && !shouldSkipConfirm(tenantId, action)) {
      setPendingConfirm(action);
      return;
    }
    runLocalAction(action);
  }

  const destructiveMeta = pendingConfirm ? DESTRUCTIVE_ACTIONS[pendingConfirm] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      {entry.allowed_actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant={action === entry.allowed_actions[0] ? 'primary' : 'outline'}
          onClick={() => handleActionClick(action)}
        >
          {ACTION_LABELS[action] ?? action}
        </Button>
      ))}

      {remindPickerOpen ? (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1">
          {REMIND_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const remindAt = new Date(Date.now() + opt.days * 24 * 60 * 60 * 1000).toISOString();
                setRemindPickerOpen(false);
                void runGenericAction('remind_later', remindAt);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      ) : null}

      {destructiveMeta ? (
        <InboxConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingConfirm(null)}
          title={destructiveMeta.title}
          description={destructiveMeta.description(entry)}
          confirmLabel={destructiveMeta.confirmLabel}
          tenantId={tenantId}
          actionKey={pendingConfirm!}
          onConfirm={() => {
            runLocalAction(pendingConfirm!);
            setPendingConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}
