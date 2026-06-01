'use client';

import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompactInr, formatCurrency } from '@/lib/utils';
import type { ProductDetailResponse } from '@/hooks/useProducts';

type TrendPeriod = '12m' | 'ytd' | '3m';

interface ProductPerformanceTabProps {
  performance: ProductDetailResponse['detail']['performance'];
}

function periodLabel(period: TrendPeriod): string {
  if (period === 'ytd') return 'Year to date';
  if (period === '3m') return 'Last 3 months';
  return 'Last 12 months';
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short' });
}

export function ProductPerformanceTab({ performance }: ProductPerformanceTabProps) {
  const [period, setPeriod] = useState<TrendPeriod>('12m');

  const trendData = useMemo(() => {
    const base = performance.monthly_units_trend;
    if (period === '3m') return base.slice(-3);
    if (period === 'ytd') {
      const year = new Date().getUTCFullYear();
      const ytd = base.filter((point) => point.month.startsWith(`${year}-`));
      return ytd.length ? ytd : base.slice(-6);
    }
    return base.slice(-12);
  }, [period, performance.monthly_units_trend]);

  const trendCurrent = trendData[trendData.length - 1]?.units ?? 0;
  const trendPrevious = trendData[trendData.length - 2]?.units ?? 0;
  const trendGrowth = trendPrevious > 0 ? ((trendCurrent - trendPrevious) / trendPrevious) * 100 : 0;

  return (
    <section className="mt-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="flex items-start justify-between border-b border-cream-300 px-5 py-4">
            <div>
              <h3 className="font-display text-[16px] text-cream-950">Units sold</h3>
              <p className="text-[13px] text-cream-700">{periodLabel(period)}</p>
            </div>
            <div className="inline-flex rounded-[10px] bg-cream-200 p-1">
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-[13px] ${period === '12m' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('12m')}
              >
                12 mo
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-[13px] ${period === 'ytd' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('ytd')}
              >
                YTD
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-[13px] ${period === '3m' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('3m')}
              >
                3 mo
              </button>
            </div>
          </div>

          <div className="border-b border-cream-200 px-5 py-4">
            <div className="flex items-end gap-3">
              <p className="font-display text-[46px] leading-none text-cream-950">{performance.units_snapshot.units_mtd}</p>
              <p className="pb-1 text-[13px] text-cream-700">
                <span className={trendGrowth >= 0 ? 'text-success-500' : 'text-danger-500'}>
                  {trendGrowth >= 0 ? '↑ +' : '↓ '}
                  {Math.abs(trendGrowth).toFixed(1)}%
                </span>{' '}
                · {formatCompactInr(performance.units_snapshot.revenue_last_30d)} in revenue
              </p>
            </div>
          </div>

          <div className="h-[220px] px-4 pb-4 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--cream-700)', fontSize: 12 }}
                  tickFormatter={monthLabel}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--cream-500)', fontSize: 11 }}
                  width={28}
                />
                <Tooltip
                  formatter={(value: number) => [`${Math.round(value)} units`, 'Units']}
                  labelFormatter={(label) => monthLabel(String(label))}
                />
                <Line type="monotone" dataKey="units" stroke="var(--ember-700)" strokeWidth={2.2} dot={{ r: 0 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[32px] leading-none text-cream-950">Inventory &amp; ops</h3>
          </div>
          <div className="grid grid-cols-2 gap-y-4 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">On hand</p>
              <p className="mt-2 font-display text-[44px] leading-none text-cream-950">{performance.inventory_ops.on_hand}</p>
              <p className="mt-1 text-[12px] text-cream-700">bottles</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Days of cover</p>
              <p className="mt-2 font-display text-[44px] leading-none text-cream-950">{performance.inventory_ops.days_cover} d</p>
              <p className="mt-1 text-[12px] text-cream-700">at current pace</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Sell-through</p>
              <p className="mt-2 font-display text-[44px] leading-none text-cream-950">{performance.inventory_ops.sell_through_pct}%</p>
              <p className="mt-1 text-[12px] text-cream-700">last 30 days</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">Last ordered</p>
              <p className="mt-2 font-display text-[32px] leading-none text-cream-950">
                {performance.inventory_ops.last_ordered_at ? new Date(performance.inventory_ops.last_ordered_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
              </p>
              <p className="mt-1 text-[12px] text-cream-700">{performance.inventory_ops.last_ordered_buyer ?? 'No buyer yet'}</p>
            </div>
          </div>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[32px] leading-none text-cream-950">Top buyers</h3>
            <p className="text-[13px] text-cream-700">Who&apos;s been buying this SKU</p>
          </div>
          <div>
            {performance.top_buyers.map((buyer, index) => (
              <div key={buyer.buyer_id} className="grid grid-cols-[26px_1fr_auto] items-center gap-3 border-b border-cream-300 px-5 py-3.5 last:border-b-0">
                <p className="font-mono text-[13px] text-cream-600">{index + 1}</p>
                <div>
                  <p className="text-[13.5px] font-medium text-cream-900">{buyer.buyer_name}</p>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-cream-700">{buyer.city ?? '—'}</p>
                </div>
                <p className="font-mono text-[14px] text-cream-900">{buyer.units} bottles</p>
              </div>
            ))}
            {performance.top_buyers.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-cream-700">No buyer activity yet.</p>
            ) : null}
          </div>
        </article>

        <article className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-300 px-5 py-4">
            <h3 className="font-display text-[32px] leading-none text-cream-950">Price by cohort</h3>
            <p className="text-[13px] text-cream-700">Base + overrides</p>
          </div>
          <table className="w-full">
            <thead className="border-b border-cream-300 bg-cream-100 text-left text-[11px] uppercase tracking-[0.08em] text-cream-700">
              <tr>
                <th className="px-5 py-2.5">Cohort</th>
                <th className="px-5 py-2.5">Price</th>
                <th className="px-5 py-2.5">Override</th>
              </tr>
            </thead>
            <tbody>
              {performance.price_by_cohort.map((item) => (
                <tr key={item.cohort} className="border-b border-cream-300 last:border-b-0">
                  <td className="px-5 py-3 text-[13px] text-cream-900">{item.cohort}</td>
                  <td className="px-5 py-3 font-mono text-[14px] text-cream-900">{formatCurrency(item.price, 'INR')}</td>
                  <td className="px-5 py-3">
                    {item.has_override ? (
                      <span className="inline-flex items-center rounded-full bg-ember-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ember-700">
                        Override
                      </span>
                    ) : (
                      <span className="text-[12px] text-cream-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {performance.price_by_cohort.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-[13px] text-cream-700">No cohort pricing configured.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>
      </div>
    </section>
  );
}
