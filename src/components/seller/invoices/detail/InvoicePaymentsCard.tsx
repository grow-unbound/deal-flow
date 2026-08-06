'use client';

import { roundMoney } from '@/lib/currency-input';
import { formatNumberValue } from '@/lib/utils';
import type { InvoicePaymentRecordDto } from '@/types/tenant-invoices';

import { formatShortDate } from './invoice-detail-dates';

function formatPaymentAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(amount));
}

export function InvoicePaymentsCard({
  payments,
  amountOutstanding,
}: {
  payments: InvoicePaymentRecordDto[];
  amountOutstanding: number;
}) {
  const due = roundMoney(amountOutstanding);
  const hasDue = due > 0;

  return (
    <section className="rounded-[14px] border border-cream-300 bg-white p-4">
      <p className="text-base font-semibold text-cream-950">Payments</p>

      {payments.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-start justify-between gap-3 rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-cream-950">{formatPaymentAmount(payment.amount)}</p>
                <p className="mt-0.5 text-cream-600">
                  {formatShortDate(payment.paid_at)}
                  {payment.payment_method ? ` · ${payment.payment_method}` : ''}
                  {payment.payment_reference ? ` · ${payment.payment_reference}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-cream-600">No payments recorded yet.</p>
      )}

      <div className="mt-4 border-t border-cream-200 pt-3">
        {hasDue ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-cream-700">Amount due</span>
            <span className="font-mono text-md font-semibold text-amber-800">{formatNumberValue(due, 'CURRENCY_EXACT')}</span>
          </div>
        ) : (
          <p className="text-sm font-medium text-teal-700">No dues</p>
        )}
      </div>
    </section>
  );
}
