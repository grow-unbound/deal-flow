'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useApplyGenericEntryAction, useApplyApprovalEntryAction } from '@/hooks/useInboxEntries';
import { missingFieldKeysForEntryType, MISSING_FIELD_LABELS } from '@/lib/inbox/missing-field-labels';
import { GENERIC_ACTIONS, ACTION_LABELS } from './InboxActionBar';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

const APPROVAL_ACTIONS = new Set(['approve', 'request_more_info', 'decline']);

interface InboxApprovalActionBarProps {
  entry: InboxEntry;
  tenantId: string;
  applyLocalAction: (
    entry: InboxEntry,
    action: string,
    opts?: { note?: string; nextStatus?: InboxEntryStatus; nextSummary?: string },
  ) => void;
}

function RequestMoreInfoDialog({
  entry,
  open,
  onOpenChange,
  onSubmitted,
}: {
  entry: InboxEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const fieldKeys = missingFieldKeysForEntryType(entry.entry_type);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const applyApprovalAction = useApplyApprovalEntryAction();

  function toggle(field: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function submit() {
    if (checked.size === 0) {
      toast.error('Select at least one field to flag as missing or incorrect');
      return;
    }
    try {
      await applyApprovalAction.mutateAsync({
        entryId: entry.id,
        action: 'request_more_info',
        note: note.trim() || undefined,
        metadata: { missing_fields: Array.from(checked) },
      });
      toast.success('Buyer notified — waiting on more info');
      onOpenChange(false);
      setChecked(new Set());
      setNote('');
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not request more info');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What's missing or incorrect?</DialogTitle>
          <DialogDescription>
            The buyer will be notified via WhatsApp about the fields you flag here.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-2">
            {fieldKeys.map((field) => (
              <Checkbox
                key={field}
                id={`missing-field-${entry.id}-${field}`}
                checked={checked.has(field)}
                onCheckedChange={() => toggle(field)}
                label={MISSING_FIELD_LABELS[field] ?? field}
              />
            ))}
          </div>
          <Textarea
            label="Note (optional)"
            placeholder="Anything specific the buyer should know"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={applyApprovalAction.isPending}>
            {applyApprovalAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({
  entry,
  open,
  onOpenChange,
  onSubmitted,
}: {
  entry: InboxEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const [note, setNote] = useState('');
  const applyApprovalAction = useApplyApprovalEntryAction();
  const canSubmit = note.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    try {
      await applyApprovalAction.mutateAsync({ entryId: entry.id, action: 'decline', note: note.trim() });
      toast.success('Account declined');
      onOpenChange(false);
      setNote('');
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not decline this account');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Decline this account?</AlertDialogTitle>
          <AlertDialogDescription>
            {entry.buyer_name} will not be approved and will be notified. A reason is required.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 py-2">
          <Textarea
            label="Reason for declining"
            placeholder="Required — shared with the buyer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setNote('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit || applyApprovalAction.isPending}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {applyApprovalAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Decline
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Action bar for `business_approval` / `new_user_login` expanded cards
 * (Task 12). Replaces the generic InboxActionBar's one-click handling of
 * `approve` / `decline` / `request_more_info` — which previously only
 * updated local optimistic state and never called the real RPC — with the
 * real mutation plus the richer UI the brief calls for: a checklist for
 * request-more-info, a required-note confirm step for decline, and a
 * pending/success state for approve. Any other allowed action for this entry
 * (add_note, view_details, view_buyer, view_activity, ignore, reopen) still
 * goes through the same generic/local paths InboxActionBar uses.
 */
export function InboxApprovalActionBar({ entry, tenantId, applyLocalAction }: InboxApprovalActionBarProps) {
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [approveState, setApproveState] = useState<'idle' | 'pending' | 'done'>('idle');
  const applyGenericAction = useApplyGenericEntryAction();
  const applyApprovalAction = useApplyApprovalEntryAction();

  async function handleApprove() {
    setApproveState('pending');
    try {
      await applyApprovalAction.mutateAsync({ entryId: entry.id, action: 'approve' });
      setApproveState('done');
      toast.success(`${entry.buyer_name} approved`);
    } catch (error) {
      setApproveState('idle');
      toast.error(error instanceof Error ? error.message : 'Could not approve this account');
    }
  }

  async function runGenericAction(action: string) {
    try {
      await applyGenericAction.mutateAsync({ entryId: entry.id, action: action as 'add_note' | 'reopen' | 'dismiss' | 'remind_later' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update this item');
    }
  }

  function handleOtherAction(action: string) {
    if (GENERIC_ACTIONS.has(action)) {
      void runGenericAction(action);
      return;
    }
    // view_details / view_buyer / view_activity / ignore — no dedicated
    // routing surface yet; matches InboxActionBar's existing placeholder
    // behavior for these across every other entry type.
    applyLocalAction(entry, action, { nextSummary: `${ACTION_LABELS[action] ?? action} done` });
  }

  const missingFields = Array.isArray(entry.metadata.missing_fields)
    ? (entry.metadata.missing_fields as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  const otherActions = entry.allowed_actions.filter((a) => !APPROVAL_ACTIONS.has(a) && a !== 'reopen');
  const canReopen = entry.allowed_actions.includes('reopen');

  return (
    <div className="space-y-3 pt-4">
      {entry.status === 'waiting' && missingFields.length > 0 ? (
        <p className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-cream-700">
          Waiting on the buyer for: {missingFields.map((f) => MISSING_FIELD_LABELS[f] ?? f).join(', ')}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {entry.allowed_actions.includes('approve') ? (
          <Button type="button" size="sm" variant="primary" onClick={handleApprove} disabled={approveState !== 'idle'}>
            {approveState === 'pending' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : approveState === 'done' ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : null}
            {approveState === 'done' ? 'Approved' : 'Approve'}
          </Button>
        ) : null}
        {entry.allowed_actions.includes('request_more_info') ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setMoreInfoOpen(true)}>
            Request more info
          </Button>
        ) : null}
        {entry.allowed_actions.includes('decline') ? (
          <Button type="button" size="sm" variant="destructive" onClick={() => setDeclineOpen(true)}>
            Decline
          </Button>
        ) : null}
        {canReopen ? (
          <Button type="button" size="sm" variant="outline" onClick={() => runGenericAction('reopen')}>
            {ACTION_LABELS.reopen}
          </Button>
        ) : null}
        {otherActions.map((action) => (
          <Button key={action} type="button" size="sm" variant="outline" onClick={() => handleOtherAction(action)}>
            {ACTION_LABELS[action] ?? action}
          </Button>
        ))}
      </div>

      <RequestMoreInfoDialog entry={entry} open={moreInfoOpen} onOpenChange={setMoreInfoOpen} onSubmitted={() => {}} />
      <DeclineDialog entry={entry} open={declineOpen} onOpenChange={setDeclineOpen} onSubmitted={() => {}} />
    </div>
  );
}
