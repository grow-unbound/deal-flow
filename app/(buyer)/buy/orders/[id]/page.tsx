'use client';

import { use } from 'react';
import { TransactionDetailPage, type TransactionDoc } from '@/components/buyer/documents/TransactionDetailPage';

function pickDoc(payload: any): TransactionDoc | null {
  const o = payload?.order;
  if (!o) return null;
  return {
    docNumber: o.order_number,
    status: o.status,
    primaryDate: o.placed_at,
    primaryDateLabel: 'Placed',
    notes: o.notes ?? null,
    placeOfSupply: o.place_of_supply ?? null,
    subtotal: o.subtotal,
    tax_total: o.tax_total,
    total_amount: o.total_amount,
    items: o.items ?? [],
  };
}

export default function BuyerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <TransactionDetailPage
      id={id}
      title="Order"
      endpoint={`/api/buyer/orders/${id}`}
      docType="order"
      pickDoc={pickDoc}
    />
  );
}
