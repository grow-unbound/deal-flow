'use client';

import { useRouter } from 'next/navigation';
import { EntityAvatar } from '@/components/seller/layout';
import { formatNumberValue } from '@/lib/utils';
import type { LocationDetailCustomer } from '@/hooks/useLocations';

interface LocationCustomersTabProps {
  customers: LocationDetailCustomer[];
}

export function LocationCustomersTab({ customers }: LocationCustomersTabProps) {
  const router = useRouter();

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Customer
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Spend MTD
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Orders MTD
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Outstanding dues
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Last order
            </th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr
              key={c.buyer_id}
              className="cursor-pointer border-b border-cream-100 transition-colors last:border-0 hover:bg-cream-50"
              onClick={() => router.push(`/customers/${c.buyer_id}`)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <EntityAvatar size={32} initials={c.initials} hue="teal" />
                  <div>
                    <p className="font-medium text-cream-900">{c.business_name}</p>
                    <p className="text-xs text-cream-600">{c.city}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono text-cream-900">
                {formatNumberValue(c.spend_mtd, 'CURRENCY_THRESHOLD')}
              </td>
              <td className="px-4 py-3 text-right font-mono text-cream-700">{c.orders_mtd}</td>
              <td
                className={`px-4 py-3 text-right font-mono font-semibold ${c.outstanding_dues > 0 ? 'text-danger-600' : 'text-cream-400'}`}
              >
                {c.outstanding_dues > 0 ? `₹${formatNumberValue(c.outstanding_dues, 'CURRENCY_THRESHOLD')}` : '—'}
              </td>
              <td className="px-4 py-3 text-cream-600">
                {c.last_order_at
                  ? new Date(c.last_order_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {customers.length === 0 && (
        <div className="py-12 text-center text-sm text-cream-500">
          No customers ordered from this location this period.
        </div>
      )}
    </div>
  );
}
