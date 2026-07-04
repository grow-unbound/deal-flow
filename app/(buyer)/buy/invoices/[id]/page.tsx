'use client';

import { use } from 'react';
import { TransactionDetailPage, type TransactionDoc } from '@/components/buyer/documents/TransactionDetailPage';

function pickDoc(payload: any): TransactionDoc | null {
  const inv = payload?.invoice;
  if (!inv) return null;
  return {
    docNumber: inv.invoice_number,
    status: inv.status,
    primaryDate: inv.invoice_date,
    primaryDateLabel: 'Invoice date',
    notes: inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : null,
    placeOfSupply: inv.place_of_supply ?? null,
    subtotal: inv.subtotal,
    tax_total: inv.tax_total,
    total_amount: inv.total_amount,
    outstandingBalance: inv.outstanding_balance,
    items: inv.items ?? [],
  };
}

export default function BuyerInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <TransactionDetailPage
      id={id}
      title="Invoice"
      endpoint={`/api/buyer/invoices/${id}`}
      docType="invoice"
      pickDoc={pickDoc}
    />
  );
}
