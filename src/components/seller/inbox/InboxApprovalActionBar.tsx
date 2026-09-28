'use client';

import { useState } from 'react';
import { Bell, Loader2, CheckCircle2, RefreshCw, StickyNote } from 'lucide-react';
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
import { useApplyGenericEntryAction, useApplyApprovalEntryAction, useRetryZohoSync } from '@/hooks/useInboxEntries';
import { useRole } from '@/hooks/useRole';
import { InboxApproveDialog } from './InboxApproveDialog';
import type { EntryHistoryEvent } from '@/hooks/useInboxEntries';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';
import { missingFieldKeysForEntryType, MISSING_FIELD_LABELS } from '@/lib/inbox/missing-field-labels';
import { GENERIC_ACTIONS, ACTION_LABELS } from './InboxActionBar';
import { InboxNoteHost } from './InboxActionSheets';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

const APPROVAL_ACTIONS = new Set(['approve', 'request_more_info', 'decline']);

interface InboxApprovalActionBarProps {
  entry: InboxEntry;
  tenantId: string;
  historyEvents?: EntryHistoryEvent[];
  localEvents?: LocalEntryEvent[];
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={applyApprovalAction.isPending}>
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
 * pending/success state for approve. Utility actions stay on the left edge of
 * the card; buyer/account navigation belongs in the detail header.
 */
export function InboxApprovalActionBar({ entry, tenantId, historyEvents, localEvents, applyLocalAction }: InboxApprovalActionBarProps) {
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveState, setApproveState] = useState<'idle' | 'done'>('idle');
  const applyGenericAction = useApplyGenericEntryAction();
  const retryZohoSync = useRetryZohoSync();
  // Approve / decline / request-info are seller_admin only (also enforced in the route and the RPC).
  const { isSellerAdmin } = useRole();

  async function handleRetryZoho() {
    try {
      await retryZohoSync.mutateAsync(entry.id);
      toast.success('Retrying Zoho sync');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not retry Zoho sync');
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
    if (action === 'add_note') {
      setNoteOpen((open) => !open);
      return;
    }
    if (GENERIC_ACTIONS.has(action)) {
      void runGenericAction(action);
      return;
    }
    applyLocalAction(entry, action, { nextSummary: `${ACTION_LABELS[action] ?? action} done` });
  }

  const missingFields = Array.isArray(entry.metadata.missing_fields)
    ? (entry.metadata.missing_fields as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  const leftActions = entry.allowed_actions.filter((a) => a === 'add_note' || a === 'remind_later');
  const canReopen = isSellerAdmin && entry.allowed_actions.includes('reopen');
  const canDecide = isSellerAdmin;
  const zohoSyncVisible = entry.status === 'resolved'
    && ['pending', 'synced', 'failed'].includes(entry.external_sync_status);

  return (
    <div className="space-y-3 pt-4">
      {entry.status === 'waiting' && missingFields.length > 0 ? (
        <p className="rounded-[10px] border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-cream-700">
          Waiting on the buyer for: {missingFields.map((f) => MISSING_FIELD_LABELS[f] ?? f).join(', ')}.
        </p>
      ) : null}

      {zohoSyncVisible ? (
        <div
          className="flex items-center justify-between gap-3 rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2 text-sm text-cream-800"
          data-testid="zoho-sync-status"
        >
          <p className="min-w-0">
            {entry.external_sync_status === 'pending'
              ? 'Syncing to Zoho…'
              : entry.external_sync_status === 'synced'
                ? 'Synced to Zoho'
                : `Zoho sync failed${entry.external_sync_error ? `: ${entry.external_sync_error}` : ''}. Approval is unaffected; retrying automatically.`}
          </p>
          {entry.external_sync_status === 'failed' && isSellerAdmin ? (
            <Button type="button" variant="outline" onClick={handleRetryZoho} disabled={retryZohoSync.isPending}>
              {retryZohoSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Retry now
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-between md:gap-3">
        <div className="order-1 flex min-w-0 items-center gap-2">
          {leftActions.map((action) => {
            const Icon = action === 'remind_later' ? Bell : StickyNote;
            return (
              <button
                key={action}
                type="button"
                title={ACTION_LABELS[action] ?? action}
                aria-label={ACTION_LABELS[action] ?? action}
                onClick={() => handleOtherAction(action)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cream-600 transition-colors hover:bg-cream-100 hover:text-cream-900 active:scale-[var(--yk-press-scale)]"
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="contents md:flex md:shrink-0 md:items-center md:justify-end md:gap-2">
          {canDecide && entry.allowed_actions.includes('request_more_info') ? (
            <Button type="button" variant="outline" className="order-3 flex-1 md:order-none md:flex-none" onClick={() => setMoreInfoOpen(true)}>
              Request more info
            </Button>
          ) : null}
          {canReopen ? (
            <Button type="button" variant="outline" className="order-2 flex-1 md:order-none md:flex-none" onClick={() => runGenericAction('reopen')}>
              {ACTION_LABELS.reopen}
            </Button>
          ) : null}
          {canDecide && entry.allowed_actions.includes('decline') ? (
            <Button
              type="button"
              variant="outline"
              className="order-3 flex-1 border-danger-500 text-danger-700 hover:border-danger-700 hover:bg-danger-50 md:order-none md:flex-none"
              onClick={() => setDeclineOpen(true)}
            >
              Decline
            </Button>
          ) : null}
          {canDecide && entry.allowed_actions.includes('approve') ? (
            <Button
              type="button"
              variant="primary"
              className="order-2 min-w-0 flex-1 basis-[calc(100%-5rem)] md:order-none md:flex-none md:basis-auto"
              onClick={() => setApproveOpen(true)}
              disabled={approveState !== 'idle'}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {approveState === 'done' ? 'Approved' : 'Approve'}
            </Button>
          ) : null}
        </div>
      </div>

      <InboxNoteHost
        entryIds={[entry.id]}
        primaryEntryId={entry.id}
        historyEvents={historyEvents}
        localEvents={localEvents}
        open={noteOpen}
        onOpenChange={setNoteOpen}
      />

      <InboxApproveDialog
        entry={entry}
        open={approveOpen}
        onOpenChange={setApproveOpen}
        onApproved={() => setApproveState('done')}
      />
      <RequestMoreInfoDialog entry={entry} open={moreInfoOpen} onOpenChange={setMoreInfoOpen} onSubmitted={() => {}} />
      <DeclineDialog entry={entry} open={declineOpen} onOpenChange={setDeclineOpen} onSubmitted={() => {}} />
    </div>
  );
}
