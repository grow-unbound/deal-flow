import { formatDate, formatNumberValue } from '@/lib/utils';
import type { InboxEntry, InboxEntryType } from './inbox-types';

export const ENTRY_TYPE_LABEL: Record<InboxEntryType, string> = {
  business_approval: 'New account',
  new_user_login: 'New visitor',
  new_enquiry: 'Open enquiry',
  new_order_confirmation: 'New order',
  order_dispatch_needed: 'Confirmed, not dispatched',
  invoice_due: 'Invoice due',
  invoice_overdue: 'Invoice overdue',
  credit_limit_breach: 'Over credit limit',
};

export function buildEntryAmountLabel(entry: InboxEntry): string | null {
  if (entry.amount == null) return null;
  return formatNumberValue(entry.amount, entry.currency === 'INR' ? 'CURRENCY_EXACT' : 'COUNT');
}

/** Type label + aging + count-formatted amount — never a currency symbol. */
export function buildEntrySubtitleParts(entry: InboxEntry): string[] {
  const parts: string[] = [ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type];
  const amountLabel = buildEntryAmountLabel(entry);
  if (amountLabel) parts.push(amountLabel);
  return parts;
}

function numericMeta(entry: InboxEntry, key: string): number | null {
  const raw = entry.metadata?.[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

function shortDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

function ageLabel(entry: InboxEntry): string | null {
  const daysFromDue = numericMeta(entry, 'days_from_due');
  if (daysFromDue != null) {
    if (entry.entry_type === 'invoice_due') {
      if (daysFromDue === 0) return 'due today';
      if (daysFromDue === 1) return 'due tomorrow';
      return `due in ${daysFromDue} days`;
    }
    const overdueDays = Math.abs(daysFromDue);
    if (overdueDays === 1) return '1 day overdue';
    return `${overdueDays} days overdue`;
  }
  const dueDate = shortDate(entry.metadata?.due_date);
  return dueDate ? `due ${dueDate}` : null;
}

export function buildListSupportingLine(entries: InboxEntry[]): string {
  if (entries.length === 0) return '';
  const collections = entries.filter((entry) => entry.entry_type === 'invoice_due' || entry.entry_type === 'invoice_overdue');
  if (collections.length > 0) {
    const total = collections.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const overdueCount = collections.filter((entry) => entry.entry_type === 'invoice_overdue').length;
    const parts = [`${formatNumberValue(total, 'CURRENCY_EXACT')} dues`];
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    return parts.join(' · ');
  }

  const primary = entries[0];
  if (primary.entry_type === 'credit_limit_breach') {
    const amount = numericMeta(primary, 'over_limit_amount') ?? primary.amount;
    return `${formatNumberValue(amount, 'CURRENCY_EXACT')} over limit`;
  }
  if (primary.entry_type === 'business_approval') return 'New account';
  if (primary.entry_type === 'new_user_login') return 'New visitor';
  if (primary.entry_type === 'invoice_due' || primary.entry_type === 'invoice_overdue') {
    return [buildEntryAmountLabel(primary), ageLabel(primary)].filter(Boolean).join(' · ');
  }
  const amount = buildEntryAmountLabel(primary);
  return [amount, ENTRY_TYPE_LABEL[primary.entry_type] ?? primary.entry_type].filter(Boolean).join(' · ');
}

export function buildDocumentDateLabel(entry: InboxEntry): string | null {
  if (entry.entry_type === 'invoice_due' || entry.entry_type === 'invoice_overdue') {
    return ageLabel(entry);
  }
  const createdAt = entry.created_at ? formatDate(entry.created_at) : null;
  return createdAt ? `Created ${createdAt}` : null;
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
