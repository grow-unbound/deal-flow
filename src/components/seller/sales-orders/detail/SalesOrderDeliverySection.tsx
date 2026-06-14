'use client';

import type { SalesOrderDetail } from '@/types/tenant-sales-orders';

interface SalesOrderDeliverySectionProps {
  buyer: SalesOrderDetail['buyer'];
}

function formatAddress(buyer: SalesOrderDetail['buyer']): string {
  const geo = buyer.geography;
  if (geo && typeof geo === 'object') {
    const line = geo.address_line ?? geo.address ?? geo.line1;
    if (typeof line === 'string' && line.trim()) return line.trim();
  }
  const parts = [buyer.city, buyer.state].filter(Boolean);
  return parts.join(', ') || '—';
}

export function SalesOrderDeliverySection({ buyer }: SalesOrderDeliverySectionProps) {
  const address = formatAddress(buyer);
  const windowLabel = '—';
  const mode = 'Distributor fleet';
  const contact =
    [buyer.contact_name, buyer.phone].filter(Boolean).join(' · ') || '—';

  return (
    <div className="space-y-3 px-5 py-4 text-base">
      <div className="flex gap-3">
        <span className="w-24 shrink-0 text-cream-600">Address</span>
        <span className="min-w-0 text-cream-900">{address}</span>
      </div>
      <div className="flex gap-3">
        <span className="w-24 shrink-0 text-cream-600">Window</span>
        <span className="text-cream-900">{windowLabel}</span>
      </div>
      <div className="flex gap-3">
        <span className="w-24 shrink-0 text-cream-600">Mode</span>
        <span className="text-cream-900">{mode}</span>
      </div>
      <div className="flex gap-3">
        <span className="w-24 shrink-0 text-cream-600">Contact</span>
        <span className="text-cream-900">{contact}</span>
      </div>
    </div>
  );
}
