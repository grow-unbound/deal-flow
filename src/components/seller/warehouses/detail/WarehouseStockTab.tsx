'use client';

import { Button } from '@/components/ui/button';
import { StatusTag } from '@/components/seller/layout';
import { formatDate } from '@/lib/utils';
import type { WarehouseDetailInventoryItem } from '@/types/tenant-warehouses';

function stockTone(status: WarehouseDetailInventoryItem['stock_status']): 'success' | 'warning' | 'danger' {
  if (status === 'out_of_stock') return 'danger';
  if (status === 'low_stock') return 'warning';
  return 'success';
}

function stockStatusLabel(status: WarehouseDetailInventoryItem['stock_status']) {
  if (status === 'out_of_stock') return 'Out of stock';
  if (status === 'low_stock') return 'Low stock';
  return 'Clear';
}

interface WarehouseStockTabProps {
  stock: WarehouseDetailInventoryItem[];
  total: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export function WarehouseStockTab({
  stock,
  total,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: WarehouseStockTabProps) {
  return (
    <div className="mt-6 space-y-4">
      <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 bg-cream-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Product</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Brand</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">On hand</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Reserved</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Sellable</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Reorder point</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.1em] text-cream-600">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((item) => (
              <tr key={item.tenant_product_id} className="border-b border-cream-100 last:border-0">
                <td className="px-4 py-3 font-medium text-cream-900">{item.product_name}</td>
                <td className="px-4 py-3 text-cream-600">{item.brand_name}</td>
                <td className="px-4 py-3 text-right font-mono text-cream-900">{item.qty_available.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-right font-mono text-cream-900">{item.qty_reserved.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-right font-mono text-cream-900">{item.sellable_units.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-right font-mono text-cream-900">{item.reorder_point != null ? item.reorder_point.toLocaleString('en-IN') : '—'}</td>
                <td className="px-4 py-3">
                  <StatusTag tone={stockTone(item.stock_status)} label={stockStatusLabel(item.stock_status)} />
                </td>
                <td className="px-4 py-3 text-cream-600">{formatDate(item.last_updated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {stock.length === 0 ? (
          <div className="py-12 text-center text-sm text-cream-500">No stock tracked in this warehouse yet.</div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-cream-600">
          Showing {stock.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} SKUs
        </p>
        {hasMore ? (
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
