'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatCompactInr, formatCurrency } from '@/lib/utils';

interface CustomerPerformanceTabProps {
  performance: TenantCustomerDetailResponse['performance'];
  performanceV2: TenantCustomerDetailResponse['performance_v2'];
}

const MIX_COLORS = ['#204A41', '#B7703D', '#A59984', '#C07A43'];

function monthTick(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short' });
}

export function CustomerPerformanceTab({ performance, performanceV2 }: CustomerPerformanceTabProps) {
  const trendValue = performance.monthly_spend_trend[performance.monthly_spend_trend.length - 1]?.spend ?? 0;
  const growth = performanceV2.headline.growth_pct;

  return (
    <section className="mt-5 grid grid-cols-2 gap-4">
      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-[17px] text-cream-950">Spend trend</h3>
          <p className="text-[13px] text-cream-700">Last 12 months</p>
        </div>
        <div className="px-5 pt-4">
          <div className="flex items-end gap-3">
            <p className="font-display text-[48px] leading-none text-cream-950">{formatCompactInr(trendValue, 1)}</p>
            <p className="pb-1 text-[14px] text-cream-700">
              <span className={growth >= 0 ? 'text-success-500' : 'text-danger-500'}>
                {growth >= 0 ? '↑ +' : '↓ '}
                {Math.abs(growth).toFixed(1)}%
              </span>
              {' · '}
              {performanceV2.headline.orders_mtd} orders · AOV {formatCompactInr(performanceV2.headline.aov_mtd, 1)}
            </p>
          </div>
        </div>
        <div className="h-[220px] px-4 pb-4 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={performance.monthly_spend_trend}>
              <defs>
                <linearGradient id="customer-spend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--teal-700)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--teal-700)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--cream-700)', fontSize: 12 }}
                tickFormatter={monthTick}
              />
              <Tooltip formatter={(value: number) => formatCompactInr(Number(value))} />
              <Area dataKey="spend" stroke="var(--teal-700)" strokeWidth={2.4} fill="url(#customer-spend-fill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-[17px] text-cream-950">Brand mix</h3>
          <p className="text-[13px] text-cream-700">This month</p>
        </div>
        <div className="px-5 py-4">
          <div className="flex h-5 overflow-hidden rounded-full border border-cream-300 bg-cream-100">
            {(performanceV2.brand_mix.rows.length ? performanceV2.brand_mix.rows : [{ brand: 'No data', spend: 0, pct: 100 }]).map((row, index) => (
              <div
                key={row.brand}
                className="flex items-center justify-center text-[10px] font-semibold text-cream-50"
                style={{ width: `${Math.max(row.pct, 8)}%`, backgroundColor: MIX_COLORS[index % MIX_COLORS.length] }}
              >
                {row.pct}%
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            {(performanceV2.brand_mix.rows.length ? performanceV2.brand_mix.rows : [{ brand: 'No brand mix data yet', spend: 0, pct: 0 }]).map((row, index) => (
              <div key={`${row.brand}-${index}`} className="flex items-center justify-between text-[14px]">
                <div className="flex items-center gap-2.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: MIX_COLORS[index % MIX_COLORS.length] }} />
                  <span className="text-cream-900">{row.brand}</span>
                </div>
                <span className="font-mono text-cream-700">{row.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-[17px] text-cream-950">Top SKUs</h3>
          <p className="text-[13px] text-cream-700">What this buyer keeps reordering</p>
        </div>
        <div>
          {(performanceV2.top_skus.length ? performanceV2.top_skus : [{ name: 'No SKU activity yet', sku: '—', revenue: 0, units: 0 }]).map((sku, index) => (
            <div key={`${sku.sku}-${index}`} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-cream-300 px-5 py-3.5 last:border-b-0">
              <p className="font-mono text-[12px] text-cream-600">{index + 1}</p>
              <div>
                <p className="text-[13.5px] font-medium text-cream-900">{sku.name}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-cream-700">{sku.sku}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-[16px] leading-none text-cream-950">{formatCompactInr(sku.revenue, 1)}</p>
                <p className="mt-1 font-mono text-[11px] text-cream-700">{sku.units} units</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
        <div className="border-b border-cream-300 px-5 py-4">
          <h3 className="font-display text-[17px] text-cream-950">Credit & ops</h3>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cream-700">Last order</p>
              <p className="mt-1 font-display text-[44px] leading-none text-cream-950">{performanceV2.credit_ops.last_order_days_ago}</p>
              <p className="mt-1 text-[13px] text-cream-700">{formatCurrency(performanceV2.credit_ops.last_order_value)}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cream-700">Catalog opens</p>
              <p className="mt-1 font-display text-[44px] leading-none text-cream-950">{performanceV2.credit_ops.catalog_opens_mtd}</p>
              <p className="mt-1 text-[13px] text-cream-700">in PWA, this month</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cream-700">Credit utilization</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-teal-700"
                style={{ width: `${Math.min(100, Math.max(0, performanceV2.credit_ops.credit_util_pct))}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] text-cream-700">
              <span>{formatCurrency(performanceV2.credit_ops.credit_used)} used</span>
              <span>
                {performanceV2.credit_ops.credit_util_pct}% of {formatCurrency(performanceV2.credit_ops.credit_limit)}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-[10px] border border-success-200 bg-success-50 px-3 py-2 text-[13px] text-success-700">
            {performanceV2.credit_ops.payment_behavior_summary}
          </div>
        </div>
      </article>
    </section>
  );
}
