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
  outstanding_balance?: number | null;
}

const RECEIVABLE_STATUSES = new Set(['sent', 'viewed', 'unpaid', 'partially_paid', 'overdue']);

// Mirrors SQL `app.invoice_status_gmv_included`: every status except `draft` and `void`
// counts toward GMV (sent/viewed/unpaid/partially_paid/paid/overdue).
const GMV_INCLUDED_STATUSES = new Set(['sent', 'viewed', 'unpaid', 'partially_paid', 'paid', 'overdue']);

export function hasInvoiceReceivableExposure(row: Pick<InvoiceStatusInput, 'status' | 'outstanding_balance'>): boolean {
  return Number(row.outstanding_balance ?? 0) > 0 && RECEIVABLE_STATUSES.has(row.status);
}

/**
 * Mirrors the SQL function `app.invoice_status_gmv_included`: an invoice counts
 * toward GMV/spend figures unless it is `draft` or `void`.
 */
export function invoiceStatusGmvIncluded(status: string): boolean {
  return GMV_INCLUDED_STATUSES.has(status);
}

export function isInvoiceOverdue(row: InvoiceStatusInput): boolean {
  if (!row.due_date) return false;
  if (!hasInvoiceReceivableExposure(row)) return false;

  const raw = row.status as InvoiceDbEffectiveStatus;
  if (raw === 'draft' || raw === 'paid' || raw === 'void') return false;
  if (!RECEIVABLE_STATUSES.has(row.status)) return false;

  const dueKey = istYmd(new Date(row.due_date));
  const todayKey = istYmd(new Date());
  return dueKey < todayKey;
}

/**
 * Effective status for UI and filters: `sent` with past `due_date` becomes `overdue`.
 */
export function effectiveInvoiceStatus(row: InvoiceStatusInput): InvoiceDbEffectiveStatus {
  const raw = row.status as InvoiceDbEffectiveStatus;
  if (raw === 'draft' || raw === 'paid' || raw === 'void' || raw === 'overdue') return raw;
  if (row.outstanding_balance !== undefined) {
    // Balance provided: require positive outstanding amount to be overdue.
    if (isInvoiceOverdue(row)) return 'overdue';
  } else if (raw === 'sent' && row.due_date) {
    // No balance info (older callers): preserve original date-only check for 'sent'.
    const dueKey = istYmd(new Date(row.due_date));
    const todayKey = istYmd(new Date());
    if (dueKey < todayKey) return 'overdue';
  }
  if (row.status === 'unpaid' || row.status === 'viewed' || row.status === 'partially_paid') return 'sent';
  return raw;
}
