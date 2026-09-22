import dynamic from 'next/dynamic';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useEnquiryTriage } from '@/hooks/useInboxEntries';
import { StatusPill } from '@/components/ui/status-pill';
import { cn, formatDate, formatNumberValue } from '@/lib/utils';
import { InboxActionBar } from './InboxActionBar';
import { InboxApprovalActionBar } from './InboxApprovalActionBar';
import { InboxApprovalDocuments } from './InboxApprovalDocuments';
import { isPinnedEntry } from '@/lib/inbox/inbox-grouping';
import { ENTRY_TYPE_LABEL, buildEntryAmountLabel } from '@/lib/inbox/inbox-entry-copy';
import type { EntryHistoryEvent } from '@/hooks/useInboxEntries';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

const InboxEnquiryPanel = dynamic(
  () => import('./InboxEnquiryPanel').then((m) => m.InboxEnquiryPanel),
  { ssr: false, loading: () => <div className="h-[220px]" aria-hidden /> },
);

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
  const isEnquiry = entry.entry_type === 'new_enquiry';
  const estimateNumber = typeof entry.metadata.estimate_number === 'string' ? entry.metadata.estimate_number : null;
  const title = ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type;
  // Only needed to show the item count in the always-visible header, whether or not
  // the card is expanded -- react-query caches this under the same key the lazy
  // panel below reuses, so it's never fetched twice.
  const enquiry = useEnquiryTriage(entry.id, isEnquiry);
  const itemCount = isEnquiry ? enquiry.data?.lines.length : undefined;

  return (
    <section id={`inbox-entry-${entry.id}`} className="relative overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      {isPinnedEntry(entry) ? (
        <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-ember-400" aria-label="Pinned — needs attention first" />
      ) : null}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className={cn(
          'flex w-full cursor-pointer items-start justify-between gap-4 px-6 py-5 text-left',
          expanded ? 'border-b border-cream-200' : undefined,
        )}
      >
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-lg font-semibold tracking-[-0.015em] text-cream-950">
            <span className="truncate">{title}{isEnquiry && estimateNumber ? ` · ${estimateNumber}` : ''}</span>
            {isEnquiry && entry.source_entity_type === 'estimate' ? (
              <a
                href={`/estimates/${entry.source_entity_id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open estimate in new tab"
                title="Open estimate in new tab"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-cream-500 transition-colors hover:bg-cream-100 hover:text-cream-900"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {itemCount != null ? <p className="text-sm text-cream-600">{itemCount} item{itemCount === 1 ? '' : 's'}</p> : null}
            {amountLabel ? <p className="text-sm text-cream-600">{amountLabel}</p> : null}
            {entry.status === 'waiting' && entry.remind_at ? (
              <StatusPill label={`Snoozed until ${formatDate(entry.remind_at)}`} tone="neutral" />
            ) : null}
            {agingTier ? <StatusPill label={agingTier} tone={AGING_TONE[agingTier] ?? 'neutral'} /> : null}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={cn('mt-1 shrink-0 text-cream-500 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden
        />
      </div>
      {expanded ? (
        <div className="space-y-5 px-6 py-6">
          {entry.metadata.last_reminder_at ? (
            <p className="text-base leading-relaxed text-cream-700">
              Last reminder sent {new Date(String(entry.metadata.last_reminder_at)).toLocaleDateString()}.
            </p>
          ) : null}
          <CreditLimitContext entry={entry} />
          {entry.entry_type === 'new_enquiry' ? <InboxEnquiryPanel entryId={entry.id} /> : null}
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
