import { ChevronDown, ExternalLink } from 'lucide-react';
import { useEnquiryTriage } from '@/hooks/useInboxEntries';
import { StatusPill } from '@/components/ui/status-pill';
import { cn, formatDate, formatNumberValue } from '@/lib/utils';
import { InboxActionBar } from './InboxActionBar';
import { InboxApprovalActionBar } from './InboxApprovalActionBar';
import { InboxEntryDetailContent, isApprovalEntry } from './InboxEntryDetailContent';
import { InboxEntryFrame } from './InboxEntryFrame';
import { isPinnedEntry } from '@/lib/inbox/inbox-grouping';
import { ENTRY_TYPE_LABEL, buildEntryAmountLabel } from '@/lib/inbox/inbox-entry-copy';
import { buildCreditLimitSupportingLine } from '@/lib/inbox/inbox-entry-copy';
import type { EntryHistoryEvent } from '@/hooks/useInboxEntries';
import type { LocalEntryEvent } from '@/lib/inbox/inbox-local-actions';
import type { InboxEntry, InboxEntryStatus } from '@/lib/inbox/inbox-types';

const AGING_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  due_soon: 'neutral',
  '1-7d': 'warning',
  '8-15d': 'warning',
  '16-30d': 'danger',
  '30d+': 'danger',
};

/**
 * The always-visible title + meta line for an entry -- shared between
 * desktop's clickable toggle header (InboxEntryCard, below) and mobile's
 * tappable list row (InboxEntryListRow), so the two never drift apart.
 */
export function InboxEntrySummary({ entry }: { entry: InboxEntry }) {
  const agingTier = typeof entry.metadata.aging_tier === 'string' ? entry.metadata.aging_tier : null;
  const isEnquiry = entry.entry_type === 'new_enquiry';
  const enquiry = useEnquiryTriage(entry.id, isEnquiry);
  // An enquiry's stored entry amount is frozen at creation (₹0 for hidden-pricing
  // enquiries) -- once the seller quotes, the live estimate total is the real value.
  const enquiryTotal = isEnquiry ? enquiry.data?.totalAmount ?? null : null;
  const amountLabel = entry.entry_type === 'credit_limit_breach'
    ? buildCreditLimitSupportingLine(entry)
    : isEnquiry
      ? (enquiryTotal != null && enquiryTotal > 0 ? formatNumberValue(enquiryTotal, 'CURRENCY_EXACT') : null)
      : buildEntryAmountLabel(entry);
  const estimateNumber = typeof entry.metadata.estimate_number === 'string' ? entry.metadata.estimate_number : null;
  const title = ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type;
  const itemCount = isEnquiry ? enquiry.data?.lines.length : undefined;

  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-1.5 text-base font-semibold tracking-[-0.015em] text-cream-900">
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
        <InboxEntrySummary entry={entry} />
        <ChevronDown
          size={16}
          className={cn('mt-1 shrink-0 text-cream-500 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden
        />
      </div>
      {expanded ? (
        <InboxEntryFrame
          variant="inline"
          footer={isApprovalEntry(entry) ? (
            <InboxApprovalActionBar
              entry={entry}
              tenantId={tenantId}
              historyEvents={historyEvents}
              localEvents={localEvents}
              applyLocalAction={applyLocalAction}
            />
          ) : (
            <InboxActionBar
              entry={entry}
              tenantId={tenantId}
              historyEvents={historyEvents}
              localEvents={localEvents}
              applyLocalAction={applyLocalAction}
            />
          )}
        >
          <InboxEntryDetailContent entry={entry} />
        </InboxEntryFrame>
      ) : null}
    </section>
  );
}
