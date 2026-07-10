const RECEIVABLE_STATUSES = new Set(['sent', 'unpaid', 'partially_paid', 'overdue', 'viewed']);

export interface InvoiceSummaryRow {
  buyer_id: string;
  due_date: string | null;
  outstanding_balance: number | null;
  status: string | null;
}

export interface BuyerInvoiceSummary {
  outstandingAmount: string;
  dueInvoiceCount: string;
  dueStatus: string;
}

function istDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function daysBetweenIst(from: Date, to: Date): number {
  const fromMs = new Date(`${istDateString(from)}T12:00:00Z`).getTime();
  const toMs = new Date(`${istDateString(to)}T12:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

function isReceivableInvoice(row: InvoiceSummaryRow): boolean {
  const outstanding = Number(row.outstanding_balance ?? 0);
  if (outstanding <= 0) return false;
  return RECEIVABLE_STATUSES.has(String(row.status ?? ''));
}

export function buildBuyerInvoiceSummaries(
  rows: InvoiceSummaryRow[],
  now = new Date(),
): Map<string, BuyerInvoiceSummary> {
  const byBuyer = new Map<string, InvoiceSummaryRow[]>();

  for (const row of rows) {
    if (!isReceivableInvoice(row) || !row.due_date) continue;
    const dueDate = new Date(row.due_date);
    if (Number.isNaN(dueDate.getTime())) continue;
    const existing = byBuyer.get(row.buyer_id) ?? [];
    existing.push(row);
    byBuyer.set(row.buyer_id, existing);
  }

  const summaries = new Map<string, BuyerInvoiceSummary>();

  for (const [buyerId, buyerRows] of byBuyer) {
    let outstandingAmount = 0;
    let maxOverdueDays = 0;
    let earliestFutureDueDays: number | null = null;
    let hasOverdue = false;

    for (const row of buyerRows) {
      const dueDate = new Date(row.due_date!);
      const outstanding = Number(row.outstanding_balance ?? 0);
      outstandingAmount += outstanding;

      const daysFromDue = daysBetweenIst(dueDate, now);
      if (daysFromDue > 0) {
        hasOverdue = true;
        maxOverdueDays = Math.max(maxOverdueDays, daysFromDue);
      } else {
        const daysUntilDue = daysBetweenIst(now, dueDate);
        earliestFutureDueDays = earliestFutureDueDays === null
          ? daysUntilDue
          : Math.min(earliestFutureDueDays, daysUntilDue);
      }
    }

    const dueStatus = hasOverdue
      ? `overdue by ${maxOverdueDays} days`
      : `due in ${earliestFutureDueDays ?? 0} days`;

    summaries.set(buyerId, {
      outstandingAmount: Math.round(outstandingAmount).toString(),
      dueInvoiceCount: String(buyerRows.length),
      dueStatus,
    });
  }

  return summaries;
}
