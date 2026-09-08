import { formatNumberValue } from '@/lib/utils';
import type { InboxEntry, InboxEntryType } from './inbox-types';

export const ENTRY_TYPE_LABEL: Record<InboxEntryType, string> = {
  business_approval: 'New business account',
  new_user_login: 'New visitor, no business info yet',
  new_enquiry: 'Open enquiry',
  new_order_confirmation: 'New order',
  order_dispatch_needed: 'Confirmed, not dispatched',
  invoice_due: 'Invoice due',
  invoice_overdue: 'Invoice overdue',
  credit_limit_breach: 'Over credit limit',
};

export function buildEntryAmountLabel(entry: InboxEntry): string | null {
  if (entry.amount == null) return null;
  return formatNumberValue(entry.amount, 'COUNT');
}

/** Type label + aging + count-formatted amount — never a currency symbol. */
export function buildEntrySubtitleParts(entry: InboxEntry): string[] {
  const parts: string[] = [ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type];
  const amountLabel = buildEntryAmountLabel(entry);
  if (amountLabel) parts.push(amountLabel);
  return parts;
}

export function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'IN'
  );
}
