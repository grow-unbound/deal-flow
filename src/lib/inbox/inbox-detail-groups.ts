import { formatNumberValue } from '@/lib/utils';
import type { InboxEntry } from './inbox-types';

export type InboxChannel = 'storefront' | 'backend' | 'manual' | 'whatsapp' | 'email' | 'phone' | 'unknown';
export type InboxDetailGroupKind = 'collection' | 'entry';
export type CollectionAgingGroup = 'due_soon' | '1-7d' | '8-15d' | '16-30d' | '30d+';

export interface CollectionInvoiceRow {
  entry: InboxEntry;
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amountLabel: string;
  dateLabel: string;
  agingGroup: CollectionAgingGroup;
}

export interface CollectionGroupSummary {
  totalAmount: number;
  totalAmountLabel: string;
  dueCount: number;
  overdueCount: number;
  entryIds: string[];
}

export interface InboxDetailGroup {
  id: string;
  kind: InboxDetailGroupKind;
  entries: InboxEntry[];
  summary?: CollectionGroupSummary;
  rowsByAging?: Array<{
    key: CollectionAgingGroup;
    label: string;
    count: number;
    totalAmount: number;
    totalAmountLabel: string;
    rows: CollectionInvoiceRow[];
  }>;
}

export const COLLECTION_AGING_LABEL: Record<CollectionAgingGroup, string> = {
  due_soon: 'Due in 7 days',
  '1-7d': '1-7 days overdue',
  '8-15d': '8-15 days overdue',
  '16-30d': '16-30 days overdue',
  '30d+': '30+ days overdue',
};

const COLLECTION_AGING_ORDER: CollectionAgingGroup[] = ['30d+', '16-30d', '8-15d', '1-7d', 'due_soon'];

export function isCollectionEntry(entry: InboxEntry): boolean {
  return entry.entry_type === 'invoice_due' || entry.entry_type === 'invoice_overdue';
}

function numericMeta(entry: InboxEntry, key: string): number | null {
  const raw = entry.metadata?.[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}

function agingGroup(entry: InboxEntry): CollectionAgingGroup {
  const tier = entry.metadata?.aging_tier;
  if (tier === '1-7d' || tier === '8-15d' || tier === '16-30d' || tier === '30d+') return tier;
  return 'due_soon';
}

function shortDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

export function invoiceRowDateLabel(entry: InboxEntry): string {
  const daysFromDue = numericMeta(entry, 'days_from_due');
  if (daysFromDue != null) {
    if (entry.entry_type === 'invoice_overdue') {
      const days = Math.abs(daysFromDue);
      return days === 1 ? '1 day overdue' : `${days} days overdue`;
    }
    if (daysFromDue === 0) return 'Due today';
    if (daysFromDue === 1) return 'Due tomorrow';
    return `Due in ${daysFromDue} days`;
  }
  const dueDate = shortDate(entry.metadata?.due_date);
  return dueDate ? `Due ${dueDate}` : 'Due soon';
}

function invoiceRow(entry: InboxEntry): CollectionInvoiceRow {
  const invoiceNumber = typeof entry.metadata?.invoice_number === 'string' && entry.metadata.invoice_number
    ? entry.metadata.invoice_number
    : `Invoice ${entry.source_entity_id.slice(0, 8).toUpperCase()}`;
  return {
    entry,
    id: entry.id,
    invoiceId: entry.source_entity_id,
    invoiceNumber,
    amountLabel: formatNumberValue(entry.amount ?? numericMeta(entry, 'amount'), 'CURRENCY_EXACT'),
    dateLabel: invoiceRowDateLabel(entry),
    agingGroup: agingGroup(entry),
  };
}

export function buildCollectionGroup(entries: InboxEntry[]): InboxDetailGroup | null {
  const collectionEntries = entries.filter(isCollectionEntry);
  if (collectionEntries.length === 0) return null;

  const rows = collectionEntries.map(invoiceRow);
  const totalAmount = collectionEntries.reduce((sum, entry) => sum + Number(entry.amount ?? numericMeta(entry, 'amount') ?? 0), 0);
  const rowsByAging = COLLECTION_AGING_ORDER
    .map((key) => {
      const groupRows = rows.filter((row) => row.agingGroup === key);
      const groupTotal = groupRows.reduce((sum, row) => sum + Number(row.entry.amount ?? numericMeta(row.entry, 'amount') ?? 0), 0);
      return {
        key,
        label: COLLECTION_AGING_LABEL[key],
        count: groupRows.length,
        totalAmount: groupTotal,
        totalAmountLabel: formatNumberValue(groupTotal, 'CURRENCY_EXACT'),
        rows: groupRows,
      };
    })
    .filter((group) => group.rows.length > 0);

  return {
    id: 'collections',
    kind: 'collection',
    entries: collectionEntries,
    summary: {
      totalAmount,
      totalAmountLabel: formatNumberValue(totalAmount, 'CURRENCY_EXACT'),
      dueCount: collectionEntries.filter((entry) => entry.entry_type === 'invoice_due').length,
      overdueCount: collectionEntries.filter((entry) => entry.entry_type === 'invoice_overdue').length,
      entryIds: collectionEntries.map((entry) => entry.id),
    },
    rowsByAging,
  };
}

export function sourceChannelForEntries(entries: InboxEntry[]): InboxChannel {
  const primary = entries[0];
  const channel = primary?.source_channel;
  if (channel === 'storefront' || channel === 'backend' || channel === 'manual' || channel === 'whatsapp' || channel === 'email' || channel === 'phone') {
    return channel;
  }
  return 'unknown';
}
