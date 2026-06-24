'use client';

import { StatusTag } from '@/components/seller/layout';
import type { LocationDetailInventoryItem } from '@/hooks/useLocations';

interface LocationInventoryTabProps {
  inventory: LocationDetailInventoryItem[];
}

type StatusTone = 'success' | 'warning' | 'danger';

function stockStatusTone(status: LocationDetailInventoryItem['stock_status']): StatusTone {
  if (status === 'out_of_stock') return 'danger';
  if (status === 'low_stock') return 'warning';
  return 'success';
}

function stockStatusLabel(status: LocationDetailInventoryItem['stock_status']): string {
  if (status === 'out_of_stock') return 'Out of stock';
  if (status === 'low_stock') return 'Low stock';
  return 'Clear';
}

export function LocationInventoryTab({ inventory }: LocationInventoryTabProps) {
  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-cream-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Product
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Brand
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              On hand
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Days cover
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Last updated
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {inventory.map((item) => (
            <tr
              key={item.tenant_product_id}
              className="border-b border-cream-100 last:border-0"
            >
              <td className="px-4 py-3 font-medium text-cream-900">{item.product_name}</td>
              <td className="px-4 py-3 text-cream-600">{item.brand_name}</td>
              <td className="px-4 py-3 text-right font-mono text-cream-900">
                {item.qty_available.toLocaleString('en-IN')}
              </td>
              <td
                className={`px-4 py-3 font-mono ${
                  item.days_cover == null
                    ? 'text-cream-400'
                    : item.days_cover < 7
                      ? 'font-semibold text-danger-600'
                      : item.days_cover < 14
                        ? 'text-amber-600'
                        : 'text-cream-800'
                }`}
              >
                {item.days_cover != null ? `${item.days_cover}d` : '—'}
              </td>
              <td className="px-4 py-3 text-cream-600">
                {new Date(item.last_updated).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </td>
              <td className="px-4 py-3">
                <StatusTag
                  tone={stockStatusTone(item.stock_status)}
                  label={stockStatusLabel(item.stock_status)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {inventory.length === 0 && (
        <div className="py-12 text-center text-sm text-cream-500">
          No inventory data for this location.
        </div>
      )}
    </div>
  );
}
