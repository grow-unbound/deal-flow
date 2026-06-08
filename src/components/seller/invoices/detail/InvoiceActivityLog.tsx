'use client';

import { AlertTriangle, Ban, Bell, CircleDollarSign, Clock, FileDown, Send } from 'lucide-react';
import type { InvoiceDetailActivity } from '@/types/tenant-invoices';
import { formatShortDate } from './invoice-detail-dates';

const KIND_ICON: Record<InvoiceDetailActivity['kind'], typeof Clock> = {
  created: Clock,
  sent: Send,
  reminder: Bell,
  payment: CircleDollarSign,
  overdue: AlertTriangle,
  pdf: FileDown,
  void: Ban,
};

interface InvoiceActivityLogProps {
  items: InvoiceDetailActivity[];
}

export function InvoiceActivityLog({ items }: InvoiceActivityLogProps) {
  return (
    <ul className="divide-y divide-cream-100 px-2 py-2">
      {items.map((ev, i) => {
        const Icon = KIND_ICON[ev.kind] ?? Clock;
        return (
          <li key={`${ev.kind}-${ev.at}-${i}`} className="flex gap-3 px-3 py-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-cream-700">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-cream-900">{ev.title}</div>
              <p className="mt-0.5 text-[12px] text-cream-700">{ev.detail}</p>
              <p className="mt-1 text-[11px] text-cream-500">
                {ev.who} · {formatShortDate(ev.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
