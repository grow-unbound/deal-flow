'use client';

import Link from 'next/link';

import { effectiveInvoiceStatus, istYmd } from '@/lib/invoice-status';
import { cn, formatCompactInr } from '@/lib/utils';

export type EstimateViewBandStatus = 'draft' | 'sent' | 'converted' | 'expired' | 'void' | 'accepted' | 'declined' | 'invoiced';

export function resolveEstimateBandStatus(status: string, validUntilYmd: string | null): EstimateViewBandStatus {
  if (status === 'void') return 'void';
  if (status === 'converted' || status === 'invoiced') return 'converted';
  if (status === 'expired') return 'expired';
  if (validUntilYmd) {
    const end = new Date(`${validUntilYmd}T23:59:59.000Z`).getTime();
    if (!Number.isNaN(end) && end < Date.now() && (status === 'sent' || status === 'accepted')) return 'expired';
  }
  if (status === 'accepted') return 'accepted';
  if (status === 'sent') return 'sent';
  if (status === 'declined') return 'declined';
  return 'draft';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatSentAt(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const end = new Date(`${isoDate}T23:59:59.000Z`).getTime();
  return Math.ceil((end - Date.now()) / DAY_MS);
}

function chipClass(status: EstimateViewBandStatus): string {
  switch (status) {
    case 'sent':
    case 'accepted':
      return 'doc-status--sent';
    case 'converted':
    case 'invoiced':
      return 'doc-status--converted';
    case 'expired':
      return 'doc-status--expired';
    case 'void':
      return 'doc-status--void';
    case 'declined':
      return 'doc-status--expired';
    default:
      return 'doc-status--draft';
  }
}

function chipLabel(status: EstimateViewBandStatus): string {
  switch (status) {
    case 'sent':
      return 'Sent';
    case 'accepted':
      return 'Accepted';
    case 'converted':
      return 'Converted';
    case 'invoiced':
      return 'Invoiced';
    case 'expired':
      return 'Expired';
    case 'void':
      return 'Void';
    case 'declined':
      return 'Declined';
    default:
      return 'Draft';
  }
}

export function DocStatusBand({
  status,
  sentAt,
  viewedAt,
  viewedByName,
  validUntil,
  voidedAt,
  convertedToOrderId,
  linkedOrderNumber,
}: {
  status: EstimateViewBandStatus;
  sentAt: string | null;
  viewedAt: string | null;
  viewedByName: string | null;
  validUntil: string | null;
  voidedAt: string | null;
  convertedToOrderId: string | null;
  linkedOrderNumber: string | null;
}) {
  const dLeft = daysUntil(validUntil);
  const expiredByDate = dLeft !== null && dLeft < 0;
  const validityClass =
    expiredByDate || status === 'expired'
      ? 'text-destructive'
      : dLeft !== null && dLeft <= 3
        ? 'text-amber-600'
        : 'text-secondary';

  const primary = (() => {
    if (status === 'draft') {
      return <span className="text-sm text-secondary">Not yet sent</span>;
    }
    if (status === 'sent' || status === 'accepted') {
      return <span className="text-sm text-secondary">Sent {formatSentAt(sentAt)}</span>;
    }
    if (status === 'converted' && convertedToOrderId) {
      const label =
        linkedOrderNumber != null && linkedOrderNumber.length > 0
          ? `→ SO-${linkedOrderNumber.replace(/^SO-?/i, '')}`
          : 'View sales order';
      return (
        <Link href={`/sales-orders/${convertedToOrderId}`} className="text-sm text-secondary hover:text-cream-900">
          {label}
        </Link>
      );
    }
    if (status === 'expired') {
      return <span className="text-sm text-secondary">Expired {formatDate(validUntil)}</span>;
    }
    if (status === 'void') {
      return (
        <span className="text-sm text-secondary">
          {voidedAt ? formatSentAt(voidedAt) : 'Voided'}
        </span>
      );
    }
    return null;
  })();

  const viewed =
    status === 'sent' || status === 'accepted'
      ? (
          <span className="text-sm text-secondary">
            {viewedAt && viewedByName
              ? `Viewed by ${viewedByName}`
              : 'Not yet viewed'}
          </span>
        )
      : null;

  const validity =
    status === 'sent' || status === 'accepted'
      ? (
          <span className={cn('text-sm', validityClass)}>
            {validUntil ? `Valid until ${formatDate(validUntil)}` : null}
            {dLeft !== null && !expiredByDate && validUntil
              ? ` · ${dLeft} day${dLeft === 1 ? '' : 's'} remaining`
              : null}
            {expiredByDate ? ' · 0 days remaining' : null}
          </span>
        )
      : null;

  return (
    <div className="doc-status-band sticky top-0 z-10 flex h-10 shrink-0 items-center gap-3 border-b border-cream-300 bg-[var(--bg-recessed)] px-6">
      <span className={cn('doc-status-chip inline-flex items-center gap-1.5 text-xs font-medium', chipClass(status))}>
        <span className="dot" aria-hidden />
        {chipLabel(status)}
      </span>
      {primary}
      {viewed}
      {validity}
    </div>
  );
}

export type InvoiceViewBandStatus = 'draft' | 'sent' | 'overdue' | 'paid' | 'void';

export function resolveInvoiceBandStatus(dbStatus: string, dueDate: string | null): InvoiceViewBandStatus {
  const eff = effectiveInvoiceStatus({ status: dbStatus, due_date: dueDate });
  return eff;
}

function formatShortDateIn(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Days from start of today (IST) until due date (IST calendar). Negative = overdue. */
function daysFromTodayIstUntilDue(dueIso: string | null): number | null {
  if (!dueIso) return null;
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return null;
  const dueKey = istYmd(due);
  const todayKey = istYmd(new Date());
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((parse(dueKey) - parse(todayKey)) / DAY_MS);
}

function invoiceChipClass(status: InvoiceViewBandStatus): string {
  switch (status) {
    case 'sent':
      return 'doc-status--sent';
    case 'paid':
      return 'doc-status--paid';
    case 'overdue':
      return 'doc-status--overdue';
    case 'void':
      return 'doc-status--void';
    default:
      return 'doc-status--draft';
  }
}

function invoiceChipLabel(status: InvoiceViewBandStatus): string {
  switch (status) {
    case 'sent':
      return 'Sent';
    case 'paid':
      return 'Paid';
    case 'overdue':
      return 'Overdue';
    case 'void':
      return 'Void';
    default:
      return 'Draft';
  }
}

export function DocStatusBandInvoice({
  dbStatus,
  dueDate,
  sentAt,
  viewedAt,
  viewedByName,
  paidAt,
  paymentMethod,
  paymentReference,
  amountOutstanding,
  grandTotal,
  voidedAt,
}: {
  dbStatus: string;
  dueDate: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  viewedByName: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  amountOutstanding: number;
  grandTotal: number;
  voidedAt: string | null;
}) {
  const bandStatus = resolveInvoiceBandStatus(dbStatus, dueDate);
  const daysLeft = daysFromTodayIstUntilDue(dueDate);
  const partialOutstanding =
    bandStatus === 'sent' && amountOutstanding > 0 && amountOutstanding < grandTotal;

  const dueUrgency = (() => {
    if (bandStatus !== 'sent') return null;
    if (!dueDate) return null;
    if (daysLeft === null) return null;
    if (daysLeft > 7) {
      return <span className="text-sm text-secondary">Due {formatShortDateIn(dueDate)}</span>;
    }
    if (daysLeft >= 1 && daysLeft <= 7) {
      return (
        <span className="text-sm text-amber-600">
          Due in {daysLeft} day{daysLeft === 1 ? '' : 's'}
        </span>
      );
    }
    if (daysLeft === 0) {
      return <span className="text-sm text-amber-600">Due today</span>;
    }
    return null;
  })();

  const primary = (() => {
    if (bandStatus === 'draft') {
      return <span className="text-sm text-secondary">Not yet sent</span>;
    }
    if (bandStatus === 'overdue') {
      const overdueDays = daysLeft !== null && daysLeft < 0 ? Math.abs(daysLeft) : 1;
      return (
        <span className="text-sm text-destructive">
          Overdue by {overdueDays} day{overdueDays === 1 ? '' : 's'}
        </span>
      );
    }
    if (bandStatus === 'sent') {
      return <span className="text-sm text-secondary">Sent {formatSentAt(sentAt)}</span>;
    }
    if (bandStatus === 'paid') {
      const method = paymentMethod ?? '—';
      const ref = paymentReference ? ` · Ref: ${paymentReference}` : '';
      return (
        <span className="text-sm text-secondary">
          {paidAt ? formatSentAt(paidAt) : 'Paid'} · {method}
          {ref}
        </span>
      );
    }
    if (bandStatus === 'void') {
      return <span className="text-sm text-secondary">{voidedAt ? formatSentAt(voidedAt) : 'Voided'}</span>;
    }
    return null;
  })();

  const viewed =
    bandStatus === 'sent' || bandStatus === 'overdue' ? (
      <span className="text-sm text-secondary">
        {viewedAt && viewedByName ? `Viewed by ${viewedByName}` : 'Not yet viewed'}
      </span>
    ) : null;

  const outstanding =
    bandStatus === 'overdue' && amountOutstanding > 0 ? (
      <span className="text-sm text-secondary">{formatCompactInr(amountOutstanding)} outstanding</span>
    ) : partialOutstanding && bandStatus === 'sent' ? (
      <span className="text-sm text-secondary">{formatCompactInr(amountOutstanding)} outstanding</span>
    ) : null;

  return (
    <div className="doc-status-band sticky top-0 z-10 flex h-10 shrink-0 items-center gap-3 border-b border-cream-300 bg-[var(--bg-recessed)] px-6">
      <span className={cn('doc-status-chip inline-flex items-center gap-1.5 text-xs font-medium', invoiceChipClass(bandStatus))}>
        <span className="dot" aria-hidden />
        {invoiceChipLabel(bandStatus)}
      </span>
      {primary}
      {viewed}
      {dueUrgency}
      {outstanding}
    </div>
  );
}

/* ── Sales order view band (EP-17-005) ───────────────────────────────────── */

export type SalesOrderViewBandStatus =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export function resolveSalesOrderBandStatus(
  dbStatus: string,
  uiStatus: string,
): SalesOrderViewBandStatus {
  if (dbStatus === 'draft') return 'draft';
  if (uiStatus === 'cancelled' || dbStatus === 'cancelled') return 'cancelled';
  if (uiStatus === 'delivered') return 'delivered';
  if (uiStatus === 'dispatched') return 'dispatched';
  if (uiStatus === 'confirmed') return 'confirmed';
  if (uiStatus === 'received') return 'received';
  return 'received';
}

function soChipClass(s: SalesOrderViewBandStatus): string {
  switch (s) {
    case 'received':
      return 'doc-status--received';
    case 'confirmed':
      return 'doc-status--confirmed';
    case 'dispatched':
      return 'doc-status--dispatched';
    case 'delivered':
      return 'doc-status--delivered';
    case 'cancelled':
      return 'doc-status--cancelled';
    default:
      return 'doc-status--draft';
  }
}

function soChipLabel(s: SalesOrderViewBandStatus): string {
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'received':
      return 'Received';
    case 'confirmed':
      return 'Confirmed';
    case 'dispatched':
      return 'Dispatched';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Draft';
  }
}

function formatYmd(ymd: string | null): string {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SalesOrderDocStatusBand({
  status,
  receivedAt,
  confirmedAt,
  dispatchedAt,
  deliveredAt,
  cancelledAt,
  deliveryDateYmd,
  carrier,
  cancelReason,
  hasBackorder,
}: {
  status: SalesOrderViewBandStatus;
  receivedAt: string | null;
  confirmedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  deliveryDateYmd: string | null;
  carrier: string | null;
  cancelReason: string | null;
  hasBackorder: boolean;
}) {
  const primary = (() => {
    if (status === 'draft') {
      return <span className="text-sm text-secondary">Not yet confirmed</span>;
    }
    if (status === 'received') {
      return <span className="text-sm text-secondary">{receivedAt ? formatSentAt(receivedAt) : '—'}</span>;
    }
    if (status === 'confirmed') {
      return (
        <span className="text-sm text-secondary">
          {confirmedAt ? formatSentAt(confirmedAt) : null}
          {deliveryDateYmd ? (
            <span className="text-secondary">
              {confirmedAt ? ' · ' : null}
              Delivery expected {formatYmd(deliveryDateYmd)}
            </span>
          ) : null}
        </span>
      );
    }
    if (status === 'dispatched') {
      const base = dispatchedAt ? formatSentAt(dispatchedAt) : '';
      const via = carrier && carrier.trim() ? ` via ${carrier.trim()}` : '';
      return (
        <span className="text-sm text-secondary">
          {base}
          {via}
        </span>
      );
    }
    if (status === 'delivered') {
      return <span className="text-sm text-secondary">{deliveredAt ? formatSentAt(deliveredAt) : null}</span>;
    }
    if (status === 'cancelled') {
      return (
        <span className="text-sm text-secondary">
          {cancelledAt ? formatSentAt(cancelledAt) : null}
          {cancelReason ? ` · ${cancelReason}` : null}
        </span>
      );
    }
    return null;
  })();

  const backorderNote =
    hasBackorder && (status === 'confirmed' || status === 'dispatched') ? (
      <span className="callout--warning inline-flex max-w-[min(420px,40vw)] shrink-0 items-center rounded-[10px] px-2.5 py-1 text-[11px] font-medium leading-snug">
        Contains backorder lines — buyer notified.
      </span>
    ) : null;

  return (
    <div className="doc-status-band sticky top-0 z-10 flex h-10 min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-cream-300 bg-[var(--bg-recessed)] px-6 py-0">
      <span className={cn('doc-status-chip inline-flex items-center gap-1.5 text-xs font-medium', soChipClass(status))}>
        <span className="dot" aria-hidden />
        {soChipLabel(status)}
      </span>
      {primary}
      {backorderNote}
    </div>
  );
}
