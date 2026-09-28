import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useBuyerOutstandingInvoices } from '@/hooks/useInboxEntries';
import { buildOutstandingSections } from '@/lib/inbox/inbox-detail-groups';
import { InboxApprovalDetails } from './InboxApprovalDetails';
import { InboxApprovalDocuments } from './InboxApprovalDocuments';
import { DuesSectionList } from './InboxCollectionGroupCard';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const InboxEnquiryPanel = dynamic(
  () => import('./InboxEnquiryPanel').then((m) => m.InboxEnquiryPanel),
  { ssr: false, loading: () => <div className="h-[220px]" aria-hidden /> },
);

export const APPROVAL_ENTRY_TYPES = new Set(['business_approval', 'new_user_login']);

export function isApprovalEntry(entry: InboxEntry): boolean {
  return APPROVAL_ENTRY_TYPES.has(entry.entry_type);
}

/** Open invoices behind an over-limit entry, grouped by aging with the total outstanding. */
function OutstandingInvoices({ buyerId }: { buyerId: string }) {
  const { data, isLoading, isError } = useBuyerOutstandingInvoices(buyerId);
  const outstanding = useMemo(() => buildOutstandingSections(data?.invoices ?? []), [data?.invoices]);

  if (isLoading) return <div className="h-40 animate-pulse rounded-[10px] bg-cream-100" aria-hidden />;
  if (isError) return <p className="text-base text-cream-600">Couldn&apos;t load outstanding invoices.</p>;
  if (outstanding.sections.length === 0) return null;

  return (
    <div className="space-y-5">
      <DuesSectionList sections={outstanding.sections} />
      <div className="flex items-baseline justify-between gap-3 border-t border-cream-200 pt-4">
        <p className="text-base font-semibold text-cream-800">Total outstanding</p>
        <p className="font-mono text-md font-bold tabular-nums text-cream-950">{outstanding.totalAmountLabel}</p>
      </div>
    </div>
  );
}

/**
 * The single place that decides what an entry's body looks like -- shared by
 * desktop's inline-expand card and mobile's stacked full-screen route so the
 * two never drift apart. Action bars are NOT included here: they're the
 * frame's `footer` slot (sticky on mobile), selected by the caller via
 * `isApprovalEntry`.
 */
export function InboxEntryDetailContent({ entry }: { entry: InboxEntry }) {
  return (
    <div className="space-y-5">
      {entry.metadata.last_reminder_at ? (
        <p className="text-base leading-relaxed text-cream-700">
          Last reminder sent {new Date(String(entry.metadata.last_reminder_at)).toLocaleDateString()}.
        </p>
      ) : null}
      {entry.entry_type === 'credit_limit_breach' && entry.buyer_id ? <OutstandingInvoices buyerId={entry.buyer_id} /> : null}
      {isApprovalEntry(entry) ? (
        <>
          <InboxApprovalDetails entry={entry} />
          <InboxApprovalDocuments entryId={entry.id} />
        </>
      ) : entry.entry_type === 'new_enquiry' ? (
        <InboxEnquiryPanel entryId={entry.id} />
      ) : null}
    </div>
  );
}
