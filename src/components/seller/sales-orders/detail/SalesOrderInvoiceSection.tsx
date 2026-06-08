'use client';

import { Package } from 'lucide-react';
import { StatusTag } from '@/components/seller/layout';
import { formatCurrency } from '@/lib/utils';
import type { SalesOrderDetail } from '@/types/tenant-sales-orders';

interface SalesOrderInvoiceSectionProps {
  uiStatus: SalesOrderDetail['ui_status'];
  invoice: SalesOrderDetail['invoice'];
  orderSubtotal: number;
  orderTax: number;
  orderTotal: number;
  buyer: SalesOrderDetail['buyer'];
  deliveryAddress: string;
  fleetMode: string;
}

export function SalesOrderInvoiceSection({
  uiStatus,
  invoice,
  orderSubtotal,
  orderTax,
  orderTotal,
  buyer,
  deliveryAddress,
  fleetMode,
}: SalesOrderInvoiceSectionProps) {
  if (uiStatus === 'received' || uiStatus === 'cancelled') {
    return (
      <div className="flex items-center gap-3 p-5 text-[13px] text-cream-600">
        <Package size={22} className="shrink-0 text-cream-400" aria-hidden />
        <span>
          No invoice yet. <span className="font-semibold text-cream-800">Confirm the order</span> to reserve stock and
          raise <span className="font-mono">INV-{new Date().getFullYear()}-…</span> automatically.
        </span>
      </div>
    );
  }

  const inv = invoice;
  const subtotal = inv ? inv.subtotal : orderSubtotal;
  const tax = inv ? inv.tax_amount : orderTax;
  const total = inv ? inv.total_amount : orderTotal;
  const invNo = inv?.invoice_number ?? '—';
  const invDate = inv?.invoice_date
    ? new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const terms = inv?.terms_label ?? 'Net 0';

  return (
    <div>
      <div className="flex items-start justify-between border-b border-cream-100 px-5 pb-3 pt-4">
        <div>
          <div className="font-mono text-[13px] font-semibold text-cream-900">{invNo}</div>
          <div className="mt-0.5 text-[11.5px] text-cream-700">
            Raised {invDate} · {terms} · IGST (inter-state)
          </div>
        </div>
        <StatusTag label="Tax invoice" tone="accent" />
      </div>
      <div className="grid grid-cols-2 gap-4 px-5 pb-4 pt-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cream-500">Billed to</div>
          <div className="mt-1 text-[13px] font-medium text-cream-900">{buyer.name}</div>
          <div className="mt-1 text-[11.5px] text-cream-700">
            {buyer.city}
            {buyer.state ? `, ${buyer.state}` : ''}
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-cream-700">
            GSTIN {buyer.gstin ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cream-500">Ship to</div>
          <div className="mt-1 text-[13px] font-medium text-cream-900">{buyer.name}</div>
          <div className="mt-1 text-[11.5px] leading-[1.45] text-cream-700">{deliveryAddress}</div>
          <div className="mt-1 font-mono text-[10.5px] text-cream-700">{fleetMode}</div>
        </div>
      </div>
      <div className="border-t border-cream-100 px-5 pb-5 pt-3">
        <div className="flex justify-between text-[13px] text-cream-800">
          <span>Taxable value</span>
          <span className="font-mono">{formatCurrency(subtotal)}</span>
        </div>
        <div className="mt-1 flex justify-between text-[13px] text-cream-800">
          <span>IGST @ 18%</span>
          <span className="font-mono">{formatCurrency(tax)}</span>
        </div>
        <div className="mt-2 flex justify-between font-display text-[17px] font-semibold text-cream-950">
          <span>Invoice total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
      {!inv ? (
        <div className="border-t border-cream-100 px-5 py-3 text-center text-[12px] text-cream-600">
          Invoice record syncing — totals reflect the order.
        </div>
      ) : null}
    </div>
  );
}
