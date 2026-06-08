'use client';

import Link from 'next/link';
import { ClipboardCheck, FileText, PlusCircle } from 'lucide-react';
import type { InvoiceDetailLinked } from '@/types/tenant-invoices';
import { formatShortDate } from './invoice-detail-dates';

interface InvoiceLinkedToSectionProps {
  linked: InvoiceDetailLinked;
}

export function InvoiceLinkedToSection({ linked }: InvoiceLinkedToSectionProps) {
  if (linked.type === 'order') {
    return (
      <div className="px-5 py-4">
        <Link
          href={`/sales-orders/${linked.order_id}`}
          className="flex items-start gap-3 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
        >
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Sales Order {linked.order_number}</span>
        </Link>
        <p className="mt-1 pl-7 text-[12px] text-cream-700">
          Converted from SO · Placed {linked.placed_at ? formatShortDate(linked.placed_at) : '—'}
        </p>
      </div>
    );
  }
  if (linked.type === 'estimate') {
    const label = linked.estimate_number ?? '—';
    return (
      <div className="px-5 py-4">
        <Link
          href={`/estimates/${linked.estimate_id}`}
          className="flex items-start gap-3 text-[13px] font-semibold text-teal-700 hover:text-teal-800"
        >
          <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Estimate {label}</span>
        </Link>
        <p className="mt-1 pl-7 text-[12px] text-cream-700">Converted directly from estimate</p>
      </div>
    );
  }
  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3 text-[13px] font-semibold text-cream-900">
        <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-cream-600" aria-hidden />
        <span>Direct invoice</span>
      </div>
      <p className="mt-1 pl-7 text-[12px] text-cream-700">Created directly — no linked SO or estimate</p>
    </div>
  );
}
