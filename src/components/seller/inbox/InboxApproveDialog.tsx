'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  useApplyApprovalEntryAction,
  useApprovalAssignmentOptions,
  useApprovalPricePreview,
} from '@/hooks/useInboxEntries';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const NO_GROUP = 'none';
const NO_PRICE_LIST = 'none';

const selectClass =
  'flex h-[var(--ctl-h-input)] w-full rounded-sm border border-cream-300 bg-white px-3 text-body text-cream-900 ' +
  'transition-colors duration-fast ease-standard focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-cream-100';

interface InboxApproveDialogProps {
  entry: InboxEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
}

/**
 * Approval confirmation: the seller confirms the buyer's Customer Group (primary) and an optional
 * Price List override BEFORE approving. Without a group the buyer would silently fall back to
 * all-buyers / base pricing, so "No group" is an explicit, confirmed choice.
 */
export function InboxApproveDialog({ entry, open, onOpenChange, onApproved }: InboxApproveDialogProps) {
  const optionsQuery = useApprovalAssignmentOptions(open);
  const options = optionsQuery.data;
  const applyApprovalAction = useApplyApprovalEntryAction();

  const [cohortChoice, setCohortChoice] = useState<string | null>(null);
  const [priceListChoice, setPriceListChoice] = useState<string>(NO_PRICE_LIST);

  // Preselect once per open: the tenant's most-used manual group, else "No group".
  useEffect(() => {
    if (!open) {
      setCohortChoice(null);
      setPriceListChoice(NO_PRICE_LIST);
      return;
    }
    if (options && cohortChoice === null) {
      setCohortChoice(options.default_cohort_id ?? NO_GROUP);
    }
  }, [open, options, cohortChoice]);

  const cohortId = cohortChoice && cohortChoice !== NO_GROUP ? cohortChoice : null;
  const priceListId = priceListChoice !== NO_PRICE_LIST ? priceListChoice : null;

  const previewQuery = useApprovalPricePreview(cohortId, priceListId, open && options != null && cohortChoice !== null);
  const headline = previewQuery.data?.headline ?? null;

  const eligibleCohorts = (options?.cohorts ?? []).filter((cohort) => cohort.eligible);
  const automaticCohorts = (options?.cohorts ?? []).filter((cohort) => !cohort.eligible);
  const ready = options != null && cohortChoice !== null;

  async function confirm() {
    if (!ready) return;
    try {
      await applyApprovalAction.mutateAsync({
        entryId: entry.id,
        action: 'approve',
        cohort_id: cohortId,
        price_list_id: priceListId,
        assignment_confirmed: true,
      });
      toast.success(`${entry.buyer_name} approved`);
      onOpenChange(false);
      onApproved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve this account');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {entry.buyer_name}</DialogTitle>
          <DialogDescription>
            Choose the customer group and price list this buyer should get. Without one, they only see default pricing.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={`approve-group-${entry.id}`} className="text-body-sm font-medium text-cream-800">
              Customer group
            </label>
            <select
              id={`approve-group-${entry.id}`}
              className={selectClass}
              value={cohortChoice ?? ''}
              disabled={!ready}
              onChange={(event) => setCohortChoice(event.target.value)}
            >
              {!ready ? <option value="">Loading…</option> : null}
              <option value={NO_GROUP}>No group – use default pricing</option>
              {eligibleCohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name} ({cohort.member_count})
                </option>
              ))}
              {automaticCohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id} disabled>
                  {cohort.name} – automatic, cannot add by hand
                </option>
              ))}
            </select>
            {automaticCohorts.length > 0 ? (
              <p className="text-caption text-cream-600">
                Automatic groups add members by rules, so a buyer can&apos;t be added to them manually. They join
                automatically if they match.
              </p>
            ) : null}
            {optionsQuery.isError ? (
              <p className="text-caption text-danger-600">Could not load customer groups. Close and try again.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`approve-price-list-${entry.id}`} className="text-body-sm font-medium text-cream-800">
              Price list (optional override)
            </label>
            <select
              id={`approve-price-list-${entry.id}`}
              className={selectClass}
              value={priceListChoice}
              disabled={!ready}
              onChange={(event) => setPriceListChoice(event.target.value)}
            >
              <option value={NO_PRICE_LIST}>None – use group / default pricing</option>
              {(options?.price_lists ?? []).map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <p className="text-caption text-cream-600">
              A price list chosen here applies to this buyer only and wins over their group&apos;s and the default lists.
            </p>
          </div>

          <div
            className="min-h-[2.75rem] rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2 text-sm text-cream-800"
            aria-live="polite"
            data-testid="approve-price-preview"
          >
            {!ready || previewQuery.isPending ? (
              <span className="text-cream-500">Checking pricing…</span>
            ) : headline ? (
              <>
                This buyer will see prices from: <strong className="font-semibold text-cream-950">{headline.name}</strong>
              </>
            ) : (
              <>This buyer will see prices from: <strong className="font-semibold text-cream-950">default catalogue prices</strong></>
            )}
          </div>

          {options?.zoho_active ? (
            <p className="text-caption text-cream-600">
              This customer will also be created in Zoho with online catalogue access. If Zoho is unavailable the
              approval still goes through and the sync is retried automatically.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={confirm}
            disabled={!ready || applyApprovalAction.isPending}
          >
            {applyApprovalAction.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            Confirm and approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
