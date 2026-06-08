'use client';

import { StatusTag, type StatusTone } from '@/components/seller/layout';
import { formatCurrency } from '@/lib/utils';
import type { SalesOrderDetail } from '@/types/tenant-sales-orders';
import { cn } from '@/lib/utils';

interface SalesOrderPaymentSectionProps {
  uiStatus: SalesOrderDetail['ui_status'];
  invoice: SalesOrderDetail['invoice'];
  orderTotal: number;
  buyer: SalesOrderDetail['buyer'];
}

function paymentPresentation(
  uiStatus: SalesOrderDetail['ui_status'],
  invoice: SalesOrderDetail['invoice'],
  orderTotal: number,
  buyer: SalesOrderDetail['buyer'],
): { tag: string; tone: StatusTone; amount: number | null; detail: string; creditNumerator: number } {
  const net = buyer.payment_terms_days > 0 ? `Net ${buyer.payment_terms_days}` : 'Net 0';
  const limit = Math.max(0, buyer.credit_limit);

  if (uiStatus === 'received') {
    return {
      tag: 'Not invoiced',
      tone: 'neutral',
      amount: null,
      detail: 'Dues appear once you confirm and the invoice is raised.',
      creditNumerator: 0,
    };
  }

  if (uiStatus === 'cancelled') {
    return {
      tag: 'No charge',
      tone: 'neutral',
      amount: null,
      detail: 'Order was cancelled — nothing billed.',
      creditNumerator: 0,
    };
  }

  if (uiStatus === 'delivered') {
    const paidAt = invoice?.invoice_date
      ? new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : '—';
    return {
      tag: 'Paid in full',
      tone: 'success',
      amount: orderTotal,
      detail: `Paid ${paidAt} · UPI`,
      creditNumerator: 0,
    };
  }

  const dueDate = invoice?.invoice_date
    ? new Date(
        new Date(invoice.invoice_date).getTime() + buyer.payment_terms_days * 24 * 60 * 60 * 1000,
      ).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '—';

  return {
    tag: 'Payment due',
    tone: 'warning',
    amount: orderTotal,
    detail: `${net} · due ${dueDate}`,
    creditNumerator: orderTotal,
  };
}

export function SalesOrderPaymentSection({ uiStatus, invoice, orderTotal, buyer }: SalesOrderPaymentSectionProps) {
  const p = paymentPresentation(uiStatus, invoice, orderTotal, buyer);
  const limit = Math.max(0, buyer.credit_limit);
  const used = Math.min(limit, p.creditNumerator);
  const pct = limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;
  const available = Math.max(0, limit - used);
  const barClass = pct >= 90 ? 'bg-danger-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-500';

  return (
    <div>
      <div className="px-5 pt-3">
        <StatusTag label={p.tag} tone={p.tone} />
      </div>
      <div className="px-5 pb-3.5 pt-2">
        {p.amount != null ? (
          <div className="font-display text-[26px] font-semibold text-cream-950">{formatCurrency(p.amount)}</div>
        ) : (
          <div className="font-display text-[26px] font-semibold text-cream-500">—</div>
        )}
        <div className="mt-1 text-[12.5px] text-cream-700">{p.detail}</div>
      </div>
      <div className="border-t border-cream-100 px-5 py-4">
        <div className="flex items-center justify-between text-[11px] text-cream-800">
          <span>Credit used</span>
          <span>
            <span className="font-semibold">{pct}%</span> of {formatCurrency(limit)}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-cream-100">
          <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-cream-600">
          <span>{formatCurrency(used)} used</span>
          <span>{formatCurrency(available)} available</span>
        </div>
      </div>
    </div>
  );
}
