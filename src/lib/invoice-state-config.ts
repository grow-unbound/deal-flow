import type { LucideIcon } from 'lucide-react';
import { Check, Download, Send } from 'lucide-react';
import type { TransactionalStatusBandStep } from '@/components/seller/transactional';
import type { StatusTone } from '@/components/seller/layout';
import { INVOICE_TIMEZONE } from '@/lib/invoice-status';
import type { InvoiceStatusValue } from '@/types/tenant-invoices';

export type InvoicePrimaryActionId = 'send_to_buyer' | 'record_payment' | 'download_pdf';
export type InvoiceSecondaryActionId = 'download_pdf' | 'send_reminder' | 'export_tally';
export type InvoiceDangerActionId = 'void_invoice';

export interface InvoiceUiContext {
  dueDateLabel: string;
  paidAtLabel: string;
  daysOverdue: number;
  termsDays: number;
}

export interface InvoiceUiConfig {
  docTypeLabel: string;
  docTypeLabelClassName?: string;
  statusPill: { label: string; tone: StatusTone };
  steps: TransactionalStatusBandStep[];
  whatsnext: string;
  primary?: {
    id: InvoicePrimaryActionId;
    label: string;
    variant: 'primary' | 'secondary';
    icon?: LucideIcon;
  };
  secondaries: InvoiceSecondaryActionId[];
  danger?: InvoiceDangerActionId;
}

function formatShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    timeZone: INVOICE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function computeDaysOverdue(dueIso: string | null): number {
  if (!dueIso) return 0;
  const due = new Date(dueIso).getTime();
  const startOfTodayIst = new Date(new Date().toLocaleString('en-US', { timeZone: INVOICE_TIMEZONE }));
  startOfTodayIst.setHours(0, 0, 0, 0);
  const diff = startOfTodayIst.getTime() - due;
  return diff > 0 ? Math.floor(diff / (24 * 60 * 60 * 1000)) : 0;
}

export function getInvoiceUiConfig(status: InvoiceStatusValue, ctx: InvoiceUiContext): InvoiceUiConfig {
  const { dueDateLabel, paidAtLabel, daysOverdue } = ctx;

  if (status === 'void') {
    return {
      docTypeLabel: 'INVOICE · VOID',
      statusPill: { label: 'Void', tone: 'neutral' },
      steps: [
        { label: 'Draft', state: 'future' },
        { label: 'Sent', state: 'future' },
        { label: 'Paid', state: 'future' },
      ],
      whatsnext: 'Voided. No charge has been raised against this buyer.',
      secondaries: ['download_pdf'],
    };
  }

  if (status === 'paid') {
    return {
      docTypeLabel: 'INVOICE · PAID',
      statusPill: { label: 'Paid', tone: 'success' },
      steps: [
        { label: 'Draft', state: 'done' },
        { label: 'Sent', state: 'done' },
        { label: 'Paid', state: 'current' },
      ],
      whatsnext: `Paid in full on ${paidAtLabel}. Nothing pending.`,
      primary: { id: 'download_pdf', label: 'Download PDF', variant: 'primary', icon: Download },
      secondaries: ['export_tally'],
    };
  }

  if (status === 'draft') {
    return {
      docTypeLabel: 'INVOICE · DRAFT',
      statusPill: { label: 'Draft', tone: 'neutral' },
      steps: [
        { label: 'Draft', state: 'current' },
        { label: 'Sent', state: 'future' },
        { label: 'Paid', state: 'future' },
      ],
      whatsnext: 'Send to the buyer to start the payment clock.',
      primary: { id: 'send_to_buyer', label: 'Send to buyer', variant: 'primary', icon: Send },
      secondaries: ['download_pdf'],
      danger: 'void_invoice',
    };
  }

  if (status === 'overdue') {
    return {
      docTypeLabel: 'INVOICE · OVERDUE',
      docTypeLabelClassName: 'text-danger-600',
      statusPill: { label: 'Overdue', tone: 'danger' },
      steps: [
        { label: 'Draft', state: 'done' },
        { label: 'Sent', state: 'current_danger' },
        { label: 'Paid', state: 'future' },
      ],
      whatsnext: `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}. Send a reminder or record payment to clear the balance.`,
      primary: { id: 'record_payment', label: 'Record payment', variant: 'primary', icon: Check },
      secondaries: ['send_reminder', 'download_pdf'],
      danger: 'void_invoice',
    };
  }

  return {
    docTypeLabel: 'INVOICE · SENT',
    statusPill: { label: 'Sent', tone: 'warning' },
    steps: [
      { label: 'Draft', state: 'done' },
      { label: 'Sent', state: 'current' },
      { label: 'Paid', state: 'future' },
    ],
    whatsnext: `Sent. Due ${dueDateLabel}. Record payment when received.`,
    primary: { id: 'record_payment', label: 'Record payment', variant: 'primary', icon: Check },
    secondaries: ['send_reminder', 'download_pdf'],
    danger: 'void_invoice',
  };
}

export function invoiceSubtitleParts(args: {
  createdAt: string;
  dueDate: string | null;
  termsDays: number;
}): string[] {
  const raised = formatShort(args.createdAt);
  const due = args.dueDate ? formatShort(args.dueDate) : '—';
  const terms = args.termsDays > 0 ? `Net ${args.termsDays}` : 'Net —';
  return [`Raised ${raised}`, `Due ${due}`, terms];
}
