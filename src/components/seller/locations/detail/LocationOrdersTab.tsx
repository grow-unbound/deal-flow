'use client';

import { useRouter } from 'next/navigation';
import { StatusTag } from '@/components/seller/layout';
import { formatCompactInr } from '@/lib/utils';
import type { LocationDetailOrder } from '@/hooks/useLocations';

interface LocationOrdersTabProps {
  orders: LocationDetailOrder[];
}

type StatusTone = 'success' | 'warning' | 'neutral' | 'danger';

function statusTone(status: string): StatusTone {
  if (['confirmed', 'dispatched', 'delivered'].includes(status)) return 'success';
  if (['received', 'partially_dispatched'].includes(status)) return 'warning';
  if (status === 'draft') return 'neutral';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LocationOrdersTab({ orders }: LocationOrdersTabProps) {
  const router = useRouter();

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Order #
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Customer
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Items
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              GMV
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.order_id}
              className="cursor-pointer border-b border-cream-100 transition-colors last:border-0 hover:bg-cream-50"
              onClick={() => router.push(`/sales-orders/${o.order_id}`)}
            >
              <td className="px-4 py-3 font-mono text-cream-900">{o.order_number}</td>
              <td className="px-4 py-3 text-cream-600">
                {new Date(o.placed_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </td>
              <td className="px-4 py-3 text-cream-900">{o.buyer_name}</td>
              <td className="px-4 py-3 text-right font-mono text-cream-700">{o.items_count}</td>
              <td className="px-4 py-3 text-right font-mono text-cream-900">
                {formatCompactInr(o.total_amount)}
              </td>
              <td className="px-4 py-3">
                <StatusTag tone={statusTone(o.status)} label={statusLabel(o.status)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="py-12 text-center text-sm text-cream-500">
          No orders found for this location.
        </div>
      )}
    </div>
  );
}
