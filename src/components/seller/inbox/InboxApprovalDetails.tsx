import { formatDate } from '@/lib/utils';
import { readExistingBuyerContext } from '@/lib/inbox/inbox-entry-copy';
import type { InboxEntry } from '@/lib/inbox/inbox-types';
import { InboxExistingBuyerSummary } from './InboxExistingBuyerSummary';

function metaText(entry: InboxEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Details of an approval request: the existing-customer snapshot when the buyer asked for app
 * access on an account that already exists, then the buyer's own details as label/value rows
 * (a two-column grid from `sm` next to the snapshot; the plain stacked list otherwise).
 */
export function InboxApprovalDetails({ entry }: { entry: InboxEntry }) {
  const existingContext = readExistingBuyerContext(entry);
  const rows: Array<[string, string | null]> = [
    ['Business name', metaText(entry, 'business_name')],
    ['Contact name', metaText(entry, 'contact_name')],
    ['Phone', metaText(entry, 'phone') ?? entry.buyer_phone],
    ['GSTIN', metaText(entry, 'gstin')],
    [existingContext ? 'Requested' : 'Submitted', entry.created_at ? formatDate(entry.created_at) : null],
  ];
  const visible = rows.filter((row): row is [string, string] => row[1] != null);
  if (visible.length === 0 && !existingContext) return null;

  return (
    <div className="space-y-6">
      {existingContext ? <InboxExistingBuyerSummary context={existingContext} /> : null}
      {visible.length > 0 ? (
        <div>
          {existingContext ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">Contact</p>
          ) : null}
          <dl className={existingContext ? 'grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2' : 'space-y-3.5'}>
            {visible.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-base text-cream-600">{label}</dt>
                <dd className="mt-0.5 break-words text-md font-medium text-cream-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
