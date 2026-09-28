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

export interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  due_date: string | null;
  outstanding_amount: number;
}

export interface DuesSectionRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  dateLabel: string;
  amountLabel: string;
}

export interface DuesSection {
  key: string;
  label: string;
  count: number;
  totalAmountLabel: string;
  rows: DuesSectionRow[];
}

const OUTSTANDING_SECTIONS: Array<{ key: string; label: string; test: (daysOverdue: number | null) => boolean }> = [
  { key: '30d+', label: COLLECTION_AGING_LABEL['30d+'], test: (d) => d != null && d > 30 },
  { key: '16-30d', label: COLLECTION_AGING_LABEL['16-30d'], test: (d) => d != null && d >= 16 && d <= 30 },
  { key: '8-15d', label: COLLECTION_AGING_LABEL['8-15d'], test: (d) => d != null && d >= 8 && d <= 15 },
  { key: '1-7d', label: COLLECTION_AGING_LABEL['1-7d'], test: (d) => d != null && d >= 1 && d <= 7 },
  { key: 'not_due', label: 'Not yet due', test: (d) => d == null || d <= 0 },
];

function istDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function daysOverdue(dueDate: string | null, now: Date): number | null {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${istDateKey(now)}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  return Math.round((today - due) / 86_400_000);
}

function outstandingDateLabel(days: number | null): string {
  if (days == null) return 'No due date';
  if (days > 0) return days === 1 ? '1 day overdue' : `${days} days overdue`;
  if (days === 0) return 'Due today';
  return days === -1 ? 'Due tomorrow' : `Due in ${-days} days`;
}

/** Groups a buyer's open invoices by aging (oldest first) with a grand total -- the same shape the dues screens render. */
export function buildOutstandingSections(
  invoices: OutstandingInvoice[],
  now: Date = new Date(),
): { sections: DuesSection[]; totalAmount: number; totalAmountLabel: string } {
  const enriched = invoices.map((invoice) => ({ invoice, days: daysOverdue(invoice.due_date, now) }));
  const sections: DuesSection[] = [];
  for (const def of OUTSTANDING_SECTIONS) {
    const members = enriched.filter((row) => def.test(row.days));
    if (members.length === 0) continue;
    const total = members.reduce((sum, row) => sum + row.invoice.outstanding_amount, 0);
    sections.push({
      key: def.key,
      label: def.label,
      count: members.length,
      totalAmountLabel: formatNumberValue(total, 'CURRENCY_EXACT'),
      rows: members.map(({ invoice, days }) => ({
        id: invoice.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        dateLabel: outstandingDateLabel(days),
        amountLabel: formatNumberValue(invoice.outstanding_amount, 'CURRENCY_EXACT'),
      })),
    });
  }
  const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.outstanding_amount, 0);
  return { sections, totalAmount, totalAmountLabel: formatNumberValue(totalAmount, 'CURRENCY_EXACT') };
}
