'use client';

import { useRouter } from 'next/navigation';
import { LandingTable, StatusTag } from '@/components/seller/layout';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatCurrency } from '@/lib/utils';

interface CustomerOrdersTabProps {
  orders: Array<{
    id: string;
    order_number?: string | null;
    number?: string | null;
    placed_at?: string | null;
    issued_at?: string | null;
    items?: number;
    gmv?: number;
    total_amount?: number;
    status: string;
  }>;
  title?: string;
  description?: string;
  routeBase?: string;
  amountLabel?: string;
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

export function CustomerOrdersTab({
  orders,
  title = 'Orders',
  description = 'All orders placed by this buyer',
  routeBase = '/sales-orders',
  amountLabel = 'GMV',
}: CustomerOrdersTabProps) {
  const router = useRouter();

  return (
    <section className="mt-5 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <div className="border-b border-cream-300 px-5 py-4">
        <h3 className="font-display text-lg text-cream-950">{title}</h3>
        <p className="text-base text-cream-700">{description}</p>
      </div>

      <LandingTable
        columns={[
          { label: 'Order ID', className: 'px-5' },
          { label: 'Date', className: 'px-5' },
          { label: 'Items', align: 'right', className: 'px-5 text-right' },
          { label: amountLabel, align: 'right', className: 'px-5 text-right' },
          { label: 'Status', className: 'px-5' },
        ]}
        className="rounded-none border-0"
      >
        {orders.map((order) => (
          <tr
            key={order.id}
            className="cursor-pointer border-b border-cream-300 bg-white transition-colors hover:bg-cream-50"
            onClick={() => router.push(`${routeBase}/${order.id}`)}
          >
            <td className="px-5 py-3.5 font-mono text-sm text-teal-700">{order.order_number ?? order.number ?? order.id.slice(0, 8)}</td>
            <td className="px-5 py-3.5 text-cream-900">{dateLabel(order.placed_at ?? order.issued_at ?? null)}</td>
            <td className="px-5 py-3.5 text-right font-mono text-base text-cream-900">{order.items ?? '—'}</td>
            <td className="px-5 py-3.5 text-right font-display text-md text-cream-950">{formatCurrency(order.gmv ?? order.total_amount ?? 0)}</td>
            <td className="px-5 py-3.5">
              <StatusTag label={order.status} tone={toTone(order.status)} />
            </td>
          </tr>
        ))}
      </LandingTable>
    </section>
  );
}
