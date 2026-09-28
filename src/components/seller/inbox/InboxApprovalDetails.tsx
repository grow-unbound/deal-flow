import { formatDate } from '@/lib/utils';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

function metaText(entry: InboxEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Onboarding-form details the buyer submitted, as plain label/value rows. */
export function InboxApprovalDetails({ entry }: { entry: InboxEntry }) {
  const rows: Array<[string, string | null]> = [
    ['Business name', metaText(entry, 'business_name')],
    ['Contact name', metaText(entry, 'contact_name')],
    ['Phone', metaText(entry, 'phone') ?? entry.buyer_phone],
    ['GSTIN', metaText(entry, 'gstin')],
    ['Submitted', entry.created_at ? formatDate(entry.created_at) : null],
  ];
  const visible = rows.filter((row): row is [string, string] => row[1] != null);
  if (visible.length === 0) return null;

  return (
    <dl className="grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-base">
      {visible.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-cream-600">{label}</dt>
          <dd className="min-w-0 break-words font-medium text-cream-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
