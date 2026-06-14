'use client';

import type { InvoiceDetailPayload, InvoiceStatusValue } from '@/types/tenant-invoices';
import { StatusTag } from '@/components/seller/layout';
import { formatCompactInr } from '@/lib/utils';
import { formatShortDate } from './invoice-detail-dates';

interface InvoicePaymentSectionProps {
  data: InvoiceDetailPayload;
}

function paymentBadge(effective: InvoiceStatusValue): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (effective === 'paid') return { label: 'Paid in full', tone: 'success' };
  if (effective === 'overdue') return { label: 'Overdue', tone: 'danger' };
  if (effective === 'void') return { label: 'Void', tone: 'neutral' };
  if (effective === 'draft') return { label: 'Draft', tone: 'neutral' };
  return { label: 'Unpaid', tone: 'warning' };
}

export function InvoicePaymentSection({ data }: InvoicePaymentSectionProps) {
  const { invoice, credit } = data;
  const eff = invoice.effective_status;
  const badge = paymentBadge(eff);
  const pct = Math.min(100, Math.max(0, credit.pct));

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusTag label={badge.label} tone={badge.tone} />
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-cream-500">Amount</div>
          <div className="font-mono text-lg font-semibold text-cream-950">{formatCompactInr(invoice.total_amount)}</div>
        </div>
      </div>
      {invoice.paid_at ? (
        <p className="text-sm text-cream-700">
          Paid on {formatShortDate(invoice.paid_at)}
          {invoice.payment_reference ? ` · Ref ${invoice.payment_reference}` : ''}
        </p>
      ) : (
        <p className="text-sm text-cream-700">
          Due {formatShortDate(invoice.due_date)} · Terms Net {data.buyer.payment_terms_days || '—'}
        </p>
      )}

      <div>
        <div className="mb-1 flex justify-between text-xs font-medium text-cream-600">
          <span>Credit used</span>
          <span>
            {formatCompactInr(credit.used)} / {formatCompactInr(credit.limit)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-cream-200">
          <div
            className="h-full rounded-full bg-teal-500 transition-[width]"
            style={{ width: `${pct}%` }}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
        <p className="mt-1 text-xs text-cream-600">Available {formatCompactInr(credit.available)}</p>
      </div>
    </div>
  );
}
