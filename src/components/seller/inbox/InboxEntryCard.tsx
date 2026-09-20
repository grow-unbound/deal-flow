import { ChevronDown } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { cn, formatNumberValue } from '@/lib/utils';
import { InboxActionBar } from './InboxActionBar';
import { InboxApprovalActionBar } from './InboxApprovalActionBar';
import { InboxApprovalDocuments } from './InboxApprovalDocuments';
import { isPinnedEntry } from '@/lib/inbox/inbox-grouping';
import { ENTRY_TYPE_LABEL, buildEntryAmountLabel } from '@/lib/inbox/inbox-entry-copy';
import type { EntryHistoryEvent } from '@/hooks/useInboxEntries';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

const APPROVAL_ENTRY_TYPES = new Set(['business_approval', 'new_user_login']);

const AGING_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  due_soon: 'neutral',
  '1-7d': 'warning',
  '8-15d': 'warning',
  '16-30d': 'danger',
  '30d+': 'danger',
};

function numericMeta(entry: InboxEntry, key: string): number | null {
  const raw = entry.metadata?.[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

function paymentTermsLabel(days: number | null): string {
  if (days == null || days <= 0) return 'Due on receipt';
  return `Net ${days} days`;
}

function CreditLimitContext({ entry }: { entry: InboxEntry }) {
  if (entry.entry_type !== 'credit_limit_breach') return null;

  const overLimit = numericMeta(entry, 'over_limit_amount') ?? entry.amount;
  const creditLimit = numericMeta(entry, 'credit_limit');
  const outstanding = numericMeta(entry, 'outstanding_balance') ?? numericMeta(entry, 'total_outstanding');
  const paymentTerms = numericMeta(entry, 'payment_terms_days') ?? numericMeta(entry, 'net_payment_terms_days');

  return (
    <div className="rounded-[10px] border border-cream-200 bg-cream-50 p-3">
      {overLimit != null ? (
        <p className="text-sm font-semibold text-cream-950">
          {formatNumberValue(overLimit, 'CURRENCY_EXACT')} over limit
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">Credit limit</p>
          <p className="mt-0.5 font-mono font-semibold tabular-nums text-cream-900">
            {creditLimit != null ? formatNumberValue(creditLimit, 'CURRENCY_EXACT') : 'Not set'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">Net payment terms</p>
          <p className="mt-0.5 font-semibold text-cream-900">{paymentTermsLabel(paymentTerms)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">Total outstanding</p>
          <p className="mt-0.5 font-mono font-semibold tabular-nums text-cream-900">
            {outstanding != null ? formatNumberValue(outstanding, 'CURRENCY_EXACT') : 'Not available'}
          </p>
        </div>
      </div>
    </div>
  );
}

interface InboxEntryCardProps {
  entry: InboxEntry;
  expanded: boolean;
  onToggle: () => void;
  tenantId: string;
  historyEvents?: EntryHistoryEvent[];
  localEvents?: LocalEntryEvent[];
  applyLocalAction: (
    entry: InboxEntry,
    action: string,
    opts?: { note?: string; nextStatus?: InboxEntryStatus; nextSummary?: string },
  ) => void;
}

export function InboxEntryCard({ entry, expanded, onToggle, tenantId, historyEvents, localEvents, applyLocalAction }: InboxEntryCardProps) {
  const agingTier = typeof entry.metadata.aging_tier === 'string' ? entry.metadata.aging_tier : null;
  const amountLabel = buildEntryAmountLabel(entry);
  const title = ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type;

  return (
    <section className="relative overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      {isPinnedEntry(entry) ? (
        <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-ember-400" aria-label="Pinned — needs attention first" />
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-start justify-between gap-4 px-5 py-4 text-left',
          expanded ? 'border-b border-cream-200' : undefined,
        )}
      >
        <div className="min-w-0">
          <h3 className="font-display text-md text-cream-900">{title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {amountLabel ? <p className="text-sm text-cream-600">{amountLabel}</p> : null}
            {agingTier ? <StatusPill label={agingTier} tone={AGING_TONE[agingTier] ?? 'neutral'} /> : null}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={cn('mt-1 shrink-0 text-cream-500 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="space-y-3 px-5 py-4">
          {entry.metadata.last_reminder_at ? (
            <p className="text-sm leading-relaxed text-cream-600">
              Last reminder sent {new Date(String(entry.metadata.last_reminder_at)).toLocaleDateString()}.
            </p>
          ) : null}
          <CreditLimitContext entry={entry} />
          {APPROVAL_ENTRY_TYPES.has(entry.entry_type) ? (
            <>
              <InboxApprovalDocuments entryId={entry.id} />
              <InboxApprovalActionBar
                entry={entry}
                tenantId={tenantId}
                historyEvents={historyEvents}
                localEvents={localEvents}
                applyLocalAction={applyLocalAction}
              />
            </>
          ) : (
            <InboxActionBar
              entry={entry}
              tenantId={tenantId}
              historyEvents={historyEvents}
              localEvents={localEvents}
              applyLocalAction={applyLocalAction}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
