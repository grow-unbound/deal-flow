'use client';

import { useRouter } from 'next/navigation';
import { LandingTable, StatusTag } from '@/components/seller/layout';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatCurrency } from '@/lib/utils';

interface CustomerOrdersTabProps {
  orders: TenantCustomerDetailResponse['orders']['rows'];
}

function toTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'delivered' || status === 'confirmed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'draft') return 'neutral';
  return 'warning';
}

function dateLabel(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CustomerOrdersTab({ orders }: CustomerOrdersTabProps) {
  const router = useRouter();

  return (
    <section className="mt-5 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <div className="border-b border-cream-300 px-5 py-4">
        <h3 className="font-display text-[17px] text-cream-950">Orders</h3>
        <p className="text-[13px] text-cream-700">All orders placed by this buyer</p>
      </div>

      <LandingTable
        columns={[
          { label: 'Order ID', className: 'px-5' },
          { label: 'Date', className: 'px-5' },
          { label: 'Items', align: 'right', className: 'px-5 text-right' },
          { label: 'GMV', align: 'right', className: 'px-5 text-right' },
          { label: 'Status', className: 'px-5' },
        ]}
        className="rounded-none border-0"
      >
        {orders.map((order) => (
          <tr
            key={order.id}
            className="cursor-pointer border-b border-cream-300 bg-white transition-colors hover:bg-cream-50"
            onClick={() => router.push(`/sales-orders/${order.id}`)}
          >
            <td className="px-5 py-3.5 font-mono text-[12px] text-teal-700">{order.order_number ?? order.id.slice(0, 8)}</td>
            <td className="px-5 py-3.5 text-cream-900">{dateLabel(order.placed_at)}</td>
            <td className="px-5 py-3.5 text-right font-mono text-[13px] text-cream-900">{order.items}</td>
            <td className="px-5 py-3.5 text-right font-display text-[15px] text-cream-950">{formatCurrency(order.gmv)}</td>
            <td className="px-5 py-3.5">
              <StatusTag label={order.status} tone={toTone(order.status)} />
            </td>
          </tr>
        ))}
      </LandingTable>
    </section>
  );
}
