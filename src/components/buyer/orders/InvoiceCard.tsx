'use client';

import { formatNumberValue } from '@/lib/utils';
import { ActivityCardShell } from './ActivityCardShell';
import type { StatusTone } from '@/components/ui/status-pill';
;

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
  href?: string;
  variant?: 'card' | 'rail';
  selected?: boolean;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

type InvoiceStatusKey = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

const statusBadge: Record<InvoiceStatusKey, { tone: StatusTone; label: string }> = {
  draft:   { tone: 'info', label: 'Draft' },
  sent:    { tone: 'warning', label: 'Due' },
  paid:    { tone: 'success', label: 'Paid' },
  overdue: { tone: 'danger', label: 'Overdue' },
  void:    { tone: 'danger', label: 'Void' },
};

function getBadge(status: string): { tone: StatusTone; label: string } {
  return statusBadge[status as InvoiceStatusKey] ?? { tone: 'warning', label: 'Due' };
}

export function InvoiceCard({ invoice, href, variant, selected }: InvoiceCardProps) {
  const badge = getBadge(invoice.status);

  const middleRight = invoice.due_date
    ? `Due ${formatDate(invoice.due_date)}`
    : '';

  return (
    <ActivityCardShell
      href={href}
      variant={variant}
      selected={selected}
      documentNumber={invoice.invoice_number}
      statusLabel={badge.label}
      statusTone={badge.tone}
      middleLeft={formatDate(invoice.invoice_date)}
      middleRight={<span className="tabular-inline">{middleRight}</span>}
      amount={
        <div className="flex flex-col items-end gap-0.5">
          <span className="tabular-inline">{formatNumberValue(invoice.total_amount, 'CURRENCY_EXACT')}</span>
          {invoice.outstanding_balance != null && invoice.outstanding_balance > 0 && (
            <span className="text-[var(--danger-500)]">
              Outstanding: {formatNumberValue(invoice.outstanding_balance, 'CURRENCY_EXACT')}
            </span>
          )}
        </div>
      }
    />
  );
}
