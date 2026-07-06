'use client';

import { PerformanceCard } from '@/components/seller/detail';
import { EntityAvatar } from '@/components/seller/layout';
import { formatDate } from '@/lib/utils';
import type { WarehouseDetailResponse } from '@/types/tenant-warehouses';

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SKU';
}

function getHue(index: number): 'teal' | 'ember' | 'cream' {
  return (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream';
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'warn' | 'danger' }) {
  const toneClass =
    tone === 'danger' ? 'text-danger-600' : tone === 'warn' ? 'text-warning-700' : 'text-cream-950';

  return (
    <div className="rounded-[10px] bg-cream-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">{label}</p>
      <p className={`mt-1 font-display text-3xl leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}

function PerformanceRow({
  index,
  name,
  meta,
  value,
  subValue,
}: {
  index: number;
  name: string;
  meta: string;
  value: string;
  subValue: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-cream-300 px-5 py-3.5 last:border-b-0">
      <EntityAvatar initials={getInitials(name)} hue={getHue(index)} size={32} />
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-cream-900">{name}</p>
        <p className="mt-0.5 truncate text-xs uppercase tracking-[0.08em] text-cream-700">{meta}</p>
      </div>
      <div className="text-right">
        <p className="font-display text-md leading-none text-cream-950">{value}</p>
        <p className="mt-1 text-xs text-cream-700">{subValue}</p>
      </div>
    </div>
  );
}

export function WarehousePerformanceTab({ data }: { data: WarehouseDetailResponse['performance'] }) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <PerformanceCard title="Inventory health" subtitle="Current stock position" bodyClassName="p-0">
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <MetricTile label="Active SKUs" value={String(data.inventory_health.active_skus)} />
          <MetricTile label="Stockout SKUs" value={String(data.inventory_health.stockout_skus)} tone="danger" />
          <MetricTile label="Low stock SKUs" value={String(data.inventory_health.low_stock_skus)} tone="warn" />
          <MetricTile
            label="Avg sellable / SKU"
            value={data.inventory_health.avg_sellable_per_sku != null ? String(data.inventory_health.avg_sellable_per_sku) : '—'}
          />
        </div>
      </PerformanceCard>

      <PerformanceCard title="Stock posture" subtitle="Routing context and replenishment pressure" bodyClassName="p-0">
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <MetricTile label="Sellable units" value={data.stock_posture.sellable_units.toLocaleString('en-IN')} />
          <MetricTile label="Reorder triggered" value={String(data.stock_posture.reorder_triggered_skus)} />
          <MetricTile label="Default warehouse" value={data.stock_posture.is_default ? 'Yes' : 'No'} />
          <MetricTile label="Linked location" value={data.stock_posture.linked_location_name ?? '—'} />
        </div>
      </PerformanceCard>

      <PerformanceCard title="Idle stock" subtitle="Positive stock with no recent demand" bodyClassName="p-0">
        {data.idle_stock.length === 0 ? (
          <p className="px-5 py-4 text-sm text-cream-500">No idle stock SKUs right now.</p>
        ) : (
          <div>
            {data.idle_stock.map((row, index) => (
              <PerformanceRow
                key={row.tenant_product_id}
                index={index}
                name={row.product_name}
                meta={`${row.brand_name} · ${row.last_demand_at ? `Last demand ${formatDate(row.last_demand_at)}` : 'No recorded demand'}`}
                value={row.sellable_units.toLocaleString('en-IN')}
                subValue="sellable units"
              />
            ))}
          </div>
        )}
      </PerformanceCard>

      <PerformanceCard title="Recent replenishment" subtitle="Latest inventory row updates" bodyClassName="p-0">
        {data.recent_replenishment.length === 0 ? (
          <p className="px-5 py-4 text-sm text-cream-500">No replenishment updates yet.</p>
        ) : (
          <div>
            {data.recent_replenishment.map((row, index) => (
              <PerformanceRow
                key={row.tenant_product_id}
                index={index}
                name={row.product_name}
                meta={`${row.brand_name} · Updated ${formatDate(row.updated_at)}`}
                value={row.qty_available.toLocaleString('en-IN')}
                subValue={`${row.qty_reserved.toLocaleString('en-IN')} reserved`}
              />
            ))}
          </div>
        )}
      </PerformanceCard>
    </section>
  );
}
