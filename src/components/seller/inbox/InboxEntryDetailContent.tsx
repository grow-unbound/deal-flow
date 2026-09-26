import dynamic from 'next/dynamic';
import { formatNumberValue } from '@/lib/utils';
import { InboxApprovalDocuments } from './InboxApprovalDocuments';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

const InboxEnquiryPanel = dynamic(
  () => import('./InboxEnquiryPanel').then((m) => m.InboxEnquiryPanel),
  { ssr: false, loading: () => <div className="h-[220px]" aria-hidden /> },
);

export const APPROVAL_ENTRY_TYPES = new Set(['business_approval', 'new_user_login']);

export function isApprovalEntry(entry: InboxEntry): boolean {
  return APPROVAL_ENTRY_TYPES.has(entry.entry_type);
}

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
      <CreditLimitContext entry={entry} />
      {isApprovalEntry(entry) ? (
        <InboxApprovalDocuments entryId={entry.id} />
      ) : entry.entry_type === 'new_enquiry' ? (
        <InboxEnquiryPanel entryId={entry.id} />
      ) : null}
    </div>
  );
}
