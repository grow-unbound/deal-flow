'use client';

import { ActivityCardShell } from './ActivityCardShell';
import type { StatusTone } from '@/components/ui/status-pill';

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
}

interface InvoiceCardProps {
  invoice: InvoiceSummary;
}

function inr(n: number): string {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

type InvoiceStatusKey = 'paid' | 'due' | 'overdue';

const statusBadge: Record<InvoiceStatusKey, { tone: StatusTone; label: string }> = {
  paid:    { tone: 'success', label: 'Paid' },
  due:     { tone: 'warning', label: 'Due' },
  overdue: { tone: 'danger', label: 'Overdue' },
};

function getBadge(status: string): { tone: StatusTone; label: string } {
  return statusBadge[status as InvoiceStatusKey] ?? statusBadge.due;
}

export function InvoiceCard({ invoice }: InvoiceCardProps) {
  const badge = getBadge(invoice.status);

  const middleRight = invoice.due_date
    ? `Due ${formatDate(invoice.due_date)}`
    : '';

  return (
    <ActivityCardShell
      documentNumber={invoice.invoice_number}
      statusLabel={badge.label}
      statusTone={badge.tone}
      middleLeft={formatDate(invoice.invoice_date)}
      middleRight={<span className="tabular-inline">{middleRight}</span>}
      amount={
        <div className="flex flex-col items-end gap-0.5">
          <span className="tabular-inline">{inr(invoice.total_amount)}</span>
          {invoice.outstanding_balance != null && invoice.outstanding_balance > 0 && (
            <span className="text-[var(--b-text-eyebrow)] text-[var(--danger-500)]">
              Outstanding: {inr(invoice.outstanding_balance)}
            </span>
          )}
        </div>
      }
    />
  );
}
