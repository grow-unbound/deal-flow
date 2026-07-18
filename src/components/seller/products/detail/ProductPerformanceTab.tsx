'use client';

import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DetailCardRenderer, DistributionList, MetricGrid, PerformanceCard, RankedList, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import { formatCompactInr, formatCurrency } from '@/lib/utils';
import type { ProductDetailResponse } from '@/hooks/useProducts';

type TrendPeriod = '12m' | 'ytd' | '3m';

interface ProductPerformanceTabProps {
  performance: ProductDetailResponse['detail']['performance'];
  performanceCards?: unknown[];
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

export function ProductPerformanceTab({ performance, performanceCards }: ProductPerformanceTabProps) {
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

  if (performanceCards?.length) {
    return (
      <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(performanceCards as DetailCardPayload[]).map((card) => (
          <DetailCardRenderer key={card.id} card={card} />
        ))}
      </section>
    );
  }


  return (
    <section className="mt-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <PerformanceCard
          title="Units sold"
          subtitle={periodLabel(period)}
          actions={(
            <div className="inline-flex rounded-[10px] bg-cream-200 p-1">
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-base ${period === '12m' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('12m')}
              >
                12 mo
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-base ${period === 'ytd' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('ytd')}
              >
                YTD
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-3 py-1.5 text-base ${period === '3m' ? 'bg-white text-cream-950 shadow-sm' : 'text-cream-700'}`}
                onClick={() => setPeriod('3m')}
              >
                3 mo
              </button>
            </div>
          )}
          bodyClassName="p-0"
        >
          <TrendFrame
            emptyTitle="No sales and units history yet"
            emptyDescription="This product does not have enough recent invoice activity for a trend."
            summary={(
              <div className="flex items-end gap-3">
                <p className="font-display text-3xl leading-none text-cream-950">{performance.units_snapshot.units_mtd}</p>
                <p className="pb-1 text-base text-cream-700">
                  <span className={trendGrowth >= 0 ? 'text-success-500' : 'text-danger-500'}>
                    {trendGrowth >= 0 ? '↑ +' : '↓ '}
                    {Math.abs(trendGrowth).toFixed(1)}%
                  </span>{' '}
                  · {formatCompactInr(performance.units_snapshot.revenue_last_30d)} in revenue
                </p>
              </div>
            )}
            chart={trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
                    tickFormatter={monthLabel}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--cream-500)', fontSize: 'var(--yk-text-xs)' }}
                    width={28}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${Math.round(value)} units`, 'Units']}
                    labelFormatter={(label) => monthLabel(String(label))}
                  />
                  <Line type="monotone" dataKey="units" stroke="var(--ember-700)" strokeWidth={2.2} dot={{ r: 0 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          />
        </PerformanceCard>

        <PerformanceCard title="Inventory &amp; ops" bodyClassName="p-0">
          <div className="p-5">
            <MetricGrid
              className="mt-0"
              tiles={[
                { label: 'On hand', value: performance.inventory_ops.on_hand, sub: 'bottles' },
                { label: 'Days of cover', value: `${performance.inventory_ops.days_cover} d`, sub: 'at current pace' },
                { label: 'Sell-through', value: `${performance.inventory_ops.sell_through_pct}%`, sub: 'last 30 days' },
                {
                  label: 'Last ordered',
                  value: performance.inventory_ops.last_ordered_at
                    ? new Date(performance.inventory_ops.last_ordered_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                    : '—',
                  sub: performance.inventory_ops.last_ordered_buyer ?? 'No buyer yet',
                },
              ]}
              showSupportingText
            />
          </div>
        </PerformanceCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PerformanceCard title="Customers buying this product" subtitle="Who&apos;s been buying this SKU" bodyClassName="p-0">
          <RankedList
            items={performance.top_buyers.map((buyer, index) => ({
              id: `${buyer.buyer_id}-${index}`,
              label: buyer.buyer_name,
              meta: buyer.city ?? '—',
              value: `${buyer.units} bottles`,
            }))}
            emptyTitle="No buyer activity yet"
            emptyDescription="This product has not been purchased by any customer in the selected horizon."
          />
        </PerformanceCard>

        <PerformanceCard title="Actual selling prices" subtitle="Base + overrides" bodyClassName="p-0">
          <DistributionList
            items={performance.price_by_cohort.map((item) => ({
              id: item.cohort,
              label: item.cohort,
              value: formatCurrency(item.price, 'INR'),
              supporting: item.has_override ? 'Override' : 'Base price',
            }))}
            emptyTitle="No customer group pricing configured"
            emptyDescription="This product does not have any price distribution by customer group yet."
          />
        </PerformanceCard>
      </div>
    </section>
  );
}
