/** IST calendar day for overdue checks (matches seller invoices landing API). */
export const INVOICE_TIMEZONE = 'Asia/Kolkata';

export function istYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INVOICE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export type InvoiceDbEffectiveStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export interface InvoiceStatusInput {
  status: string;
  due_date: string | null;
}

/**
 * Effective status for UI and filters: `sent` with past `due_date` becomes `overdue`.
 */
export function effectiveInvoiceStatus(row: InvoiceStatusInput): InvoiceDbEffectiveStatus {
  const raw = row.status as InvoiceDbEffectiveStatus;
  if (raw === 'draft' || raw === 'paid' || raw === 'void' || raw === 'overdue') return raw;
  if (raw === 'sent' && row.due_date) {
    const dueKey = istYmd(new Date(row.due_date));
    const todayKey = istYmd(new Date());
    if (dueKey < todayKey) return 'overdue';
  }
  return raw;
}
