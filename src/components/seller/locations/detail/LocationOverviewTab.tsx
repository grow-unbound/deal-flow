'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PerformanceCard } from '@/components/seller/detail';
import { EntityAvatar } from '@/components/seller/layout';
import { formatCompactInr } from '@/lib/utils';
import type { LocationDetailResponse } from '@/hooks/useLocations';

interface LocationOverviewTabProps {
  data: LocationDetailResponse['overview'];
}

export function LocationOverviewTab({ data }: LocationOverviewTabProps) {
  const h = data.inventory_health;

  return (
    <div className="mt-6 grid grid-cols-2 gap-6">
      <PerformanceCard title="Revenue trend" subtitle="MTD by week" bodyClassName="p-5">
        {data.gmv_trend.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-cream-400">
            No orders yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.gmv_trend} barSize={28}>
              <XAxis
                dataKey="week_label"
                tick={{ fontSize: 11, fill: '#8A7E74' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: '#8A7E74' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'GMV']} />
              <Bar dataKey="gmv" fill="#0D9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </PerformanceCard>

      <PerformanceCard title="Inventory health" subtitle="Current stock position" bodyClassName="p-5">
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Active SKUs</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">{h.active_skus}</p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Out of stock</p>
            <p
              className={`mt-0.5 text-lg font-semibold ${h.oos_skus > 0 ? 'text-danger-600' : 'text-cream-950'}`}
            >
              {h.oos_skus}
            </p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Low stock</p>
            <p
              className={`mt-0.5 text-lg font-semibold ${h.low_stock_skus > 0 ? 'text-amber-600' : 'text-cream-950'}`}
            >
              {h.low_stock_skus}
            </p>
          </div>
          <div className="rounded-[10px] bg-cream-50 p-3">
            <p className="text-xs text-cream-600">Avg days cover</p>
            <p className="mt-0.5 text-lg font-semibold text-cream-950">
              {h.avg_days_cover != null ? `${h.avg_days_cover}d` : '—'}
            </p>
          </div>
        </div>

        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-cream-600">
          Top buyers
        </p>
        {data.top_buyers.length === 0 ? (
          <p className="text-xs text-cream-500">No orders this period</p>
        ) : (
          <div className="space-y-2">
            {data.top_buyers.map((buyer) => (
              <div key={buyer.buyer_id} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <EntityAvatar size={28} initials={buyer.initials} hue="teal" />
                  <p className="truncate text-sm text-cream-900">{buyer.business_name}</p>
                </div>
                <p className="shrink-0 font-mono text-sm text-cream-700">
                  {formatCompactInr(buyer.spend_mtd)}
                </p>
              </div>
            ))}
          </div>
        )}
      </PerformanceCard>
    </div>
  );
}
