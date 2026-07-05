'use client';

import { PerformanceCard } from '@/components/seller/detail';
import { formatDate } from '@/lib/utils';
import type { WarehouseDetailResponse } from '@/types/tenant-warehouses';

export function WarehousePerformanceTab({ data }: { data: WarehouseDetailResponse['performance'] }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-6">
      <PerformanceCard title="Inventory health" subtitle="Current stock position" bodyClassName="p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Active SKUs</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">{data.inventory_health.active_skus}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Stockout SKUs</p>
            <p className="mt-0.5 text-lg font-semibold text-danger-600">{data.inventory_health.stockout_skus}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Low stock SKUs</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-600">{data.inventory_health.low_stock_skus}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Avg sellable / SKU</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">
              {data.inventory_health.avg_sellable_per_sku != null ? data.inventory_health.avg_sellable_per_sku : '—'}
            </p>
          </div>
        </div>
      </PerformanceCard>

      <PerformanceCard title="Stock posture" subtitle="Routing context and replenishment pressure" bodyClassName="p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Sellable units</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">{data.stock_posture.sellable_units.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Reorder triggered</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">{data.stock_posture.reorder_triggered_skus}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Default warehouse</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">{data.stock_posture.is_default ? 'Yes' : 'No'}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Linked location</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">{data.stock_posture.linked_location_name ?? '—'}</p>
          </div>
        </div>
      </PerformanceCard>

      <PerformanceCard title="Idle stock" subtitle="Positive stock with no recent demand" bodyClassName="p-5">
        {data.idle_stock.length === 0 ? (
          <p className="text-sm text-cream-500">No idle stock SKUs right now.</p>
        ) : (
          <div className="space-y-3">
            {data.idle_stock.map((row) => (
              <div key={row.tenant_product_id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-cream-900">{row.product_name}</p>
                  <p className="truncate text-xs text-cream-600">
                    {row.brand_name} · {row.last_demand_at ? `Last demand ${formatDate(row.last_demand_at)}` : 'No recorded demand'}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-cream-700">{row.sellable_units.toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        )}
      </PerformanceCard>

      <PerformanceCard title="Recent replenishment" subtitle="Latest inventory row updates" bodyClassName="p-5">
        {data.recent_replenishment.length === 0 ? (
          <p className="text-sm text-cream-500">No replenishment updates yet.</p>
        ) : (
          <div className="space-y-3">
            {data.recent_replenishment.map((row) => (
              <div key={row.tenant_product_id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-cream-900">{row.product_name}</p>
                  <p className="truncate text-xs text-cream-600">
                    {row.brand_name} · Updated {formatDate(row.updated_at)}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-cream-700">{row.qty_available.toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        )}
      </PerformanceCard>
    </div>
  );
}
