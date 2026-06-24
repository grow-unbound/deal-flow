'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import { useRouter } from 'next/navigation';
import type { CategoryDetailOverview } from '@/hooks/useCategories';
import { formatCompactInr } from '@/lib/utils';

interface CategoryOverviewTabProps {
  overview: CategoryDetailOverview;
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' | 'warning' | 'neutral' }) {
  const valueClass =
    tone === 'danger'
      ? 'text-danger-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-cream-900';
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-cream-200 bg-white px-4 py-3">
      <span className="text-xs text-cream-500">{label}</span>
      <span className={`text-xl font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

export function CategoryOverviewTab({ overview }: CategoryOverviewTabProps) {
  const router = useRouter();
  const { trend_weekly, stock_health, top_brands } = overview;

  const hasChart = trend_weekly.some((w) => w.gmv > 0);

  return (
    <div className="mt-6 grid grid-cols-5 gap-4">
      {/* Left: revenue trend chart */}
      <div className="col-span-3 space-y-4">
        <div className="rounded-[14px] border border-cream-200 bg-white p-5">
          <p className="text-sm font-medium text-cream-700">Revenue trend</p>
          <p className="mb-4 text-xs text-cream-400">6-week rolling window</p>

          {hasChart ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend_weekly} barSize={28} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="week_label"
                  tick={{ fontSize: 11, fill: '#9B9285' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => [formatCompactInr(v), 'GMV']}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid #E8E3DC',
                    fontSize: 12,
                    padding: '6px 10px',
                  }}
                  cursor={{ fill: '#F5F2EE' }}
                />
                <Bar dataKey="gmv" radius={[4, 4, 0, 0]}>
                  {trend_weekly.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === trend_weekly.length - 1 ? '#346A5C' : '#C5DDD8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-cream-400">
              No orders in this period
            </div>
          )}
        </div>

        {/* Top brands mini-table */}
        {top_brands.length > 0 && (
          <div className="rounded-[14px] border border-cream-200 bg-white">
            <div className="border-b border-cream-200 px-5 py-3">
              <p className="text-sm font-medium text-cream-700">Top brands in category</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-100">
                  <th className="px-5 py-2.5 text-left text-xs text-cream-500">Brand</th>
                  <th className="px-5 py-2.5 text-right text-xs text-cream-500">Units</th>
                  <th className="px-5 py-2.5 text-right text-xs text-cream-500">GMV</th>
                </tr>
              </thead>
              <tbody>
                {top_brands.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-b border-cream-100 last:border-0 hover:bg-cream-50"
                    onClick={() => router.push(`/brands/${b.id}`)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-cream-100 text-[10px] font-semibold text-cream-700">
                          {b.initials}
                        </span>
                        <span className="font-medium text-cream-900">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-cream-700">{b.units_mtd}</td>
                    <td className="px-5 py-3 text-right font-medium text-cream-900">
                      {b.gmv_mtd > 0 ? formatCompactInr(b.gmv_mtd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: 2×2 stock health grid */}
      <div className="col-span-2 space-y-3">
        <p className="text-sm font-medium text-cream-700">Stock health</p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Active SKUs" value={stock_health.active_sku_count} tone="neutral" />
          <StatCard
            label="Out of stock"
            value={stock_health.oos_sku_count}
            tone={stock_health.oos_sku_count > 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="Low stock"
            value={stock_health.low_stock_sku_count}
            tone={stock_health.low_stock_sku_count > 0 ? 'warning' : 'neutral'}
          />
          <StatCard label="No sales 30d" value={stock_health.uncovered_sku_count} tone="neutral" />
        </div>
      </div>
    </div>
  );
}
