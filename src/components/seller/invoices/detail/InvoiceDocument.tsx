'use client';

import type { InvoiceDetailPayload } from '@/types/tenant-invoices';
import { formatCompactInr } from '@/lib/utils';
import { formatShortDate } from './invoice-detail-dates';

interface InvoiceDocumentProps {
  data: InvoiceDetailPayload;
}

export function InvoiceDocument({ data }: InvoiceDocumentProps) {
  const { invoice, buyer, tenant, items, tax_breakdown } = data;
  const rateHalf =
    tax_breakdown.is_intra_state && items.length > 0 && items[0].tax_rate != null
      ? `${(Number(items[0].tax_rate) / 2).toFixed(1)}%`
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-200 pb-4">
        <div>
          <div className="mb-2 inline-flex rounded-full border border-cream-300 bg-cream-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-800">
            Tax invoice
          </div>
          <div className="font-display text-[22px] font-semibold text-cream-950">{tenant.business_name}</div>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-cream-700">
            {tenant.gstin ? `GSTIN ${tenant.gstin}` : 'GSTIN —'}
            {tenant.primary_state ? ` · ${tenant.primary_state}` : ''}
          </p>
        </div>
        <div className="text-right text-[12px] text-cream-700">
          <div className="font-mono text-[13px] font-semibold text-cream-900">{invoice.invoice_number}</div>
          <div className="mt-1">Date {formatShortDate(invoice.invoice_date)}</div>
          <div>Due {formatShortDate(invoice.due_date)}</div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Bill to</div>
          <div className="mt-1 text-[14px] font-semibold text-cream-950">{buyer.business_name}</div>
          <p className="mt-1 text-[12px] text-cream-700">{buyer.gstin ? `GSTIN ${buyer.gstin}` : 'GSTIN —'}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-cream-700">{data.delivery_label}</p>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Ship / fleet</div>
          <p className="mt-1 text-[13px] text-cream-800">{data.fleet_mode}</p>
          <p className="mt-3 text-[12px] leading-relaxed text-cream-700">{tenant.payment_instructions}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="v2-table w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-cream-200 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-600">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">HSN</th>
              <th className="num py-2 pr-3">Qty</th>
              <th className="num py-2 pr-3">Rate</th>
              <th className="num py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-cream-100">
                <td className="py-2.5 pr-3 font-medium text-cream-900">{row.product_name}</td>
                <td className="py-2.5 pr-3 font-mono text-[12px] text-cream-700">{row.hsn_code ?? '—'}</td>
                <td className="num py-2.5 pr-3">{row.qty}</td>
                <td className="num py-2.5 pr-3">{formatCompactInr(row.unit_price)}</td>
                <td className="num py-2.5 font-medium">{formatCompactInr(row.line_total ?? row.qty * row.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-end gap-8 border-t border-cream-200 pt-4 text-[13px]">
        <div className="text-right">
          <div className="text-cream-600">Taxable value</div>
          <div className="font-mono font-semibold text-cream-900">{formatCompactInr(tax_breakdown.taxable_value)}</div>
        </div>
        {tax_breakdown.is_intra_state ? (
          <>
            <div className="text-right">
              <div className="text-cream-600">CGST {rateHalf ?? ''}</div>
              <div className="font-mono font-semibold text-cream-900">{formatCompactInr(tax_breakdown.cgst ?? 0)}</div>
            </div>
            <div className="text-right">
              <div className="text-cream-600">SGST {rateHalf ?? ''}</div>
              <div className="font-mono font-semibold text-cream-900">{formatCompactInr(tax_breakdown.sgst ?? 0)}</div>
            </div>
          </>
        ) : (
          <div className="text-right">
            <div className="text-cream-600">IGST</div>
            <div className="font-mono font-semibold text-cream-900">{formatCompactInr(tax_breakdown.igst ?? 0)}</div>
          </div>
        )}
        <div className="text-right">
          <div className="text-cream-600">Total</div>
          <div className="font-mono text-[15px] font-semibold text-cream-950">{formatCompactInr(invoice.total_amount)}</div>
        </div>
      </div>
    </div>
  );
}
