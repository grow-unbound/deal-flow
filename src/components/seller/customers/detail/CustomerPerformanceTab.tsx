'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { DetailCardRenderer, PerformanceCard, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatNumberValue } from '@/lib/utils';

interface CustomerPerformanceTabProps {
  performance: TenantCustomerDetailResponse['performance'];
  performanceCards?: unknown[];
}

const MIX_COLORS = ['#204A41', '#B7703D', '#A59984', '#C07A43'];

function monthTick(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short' });
}

export function CustomerPerformanceTab({ performance, performanceCards }: CustomerPerformanceTabProps) {
  const trendValue = performance.monthly_spend_trend[performance.monthly_spend_trend.length - 1]?.spend ?? 0;
  const brandMixCard: DetailCardPayload<typeof performance.brand_affinity> = {
    representation: 'mix',
    title: 'What this customer buys',
    subtitle: 'Brand mix',
    time_basis: '90D',
    availability: 'ready',
    body: performance.brand_affinity,
  };

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
    <section className="mt-5 grid grid-cols-2 gap-4">
      <PerformanceCard title="Sales and demand history" subtitle="Last 12 months" bodyClassName="p-0">
        <TrendFrame
          emptyTitle="No sales history yet"
          emptyDescription="This customer does not have enough recent invoiced history for a trend."
          summary={(
            <p className="font-display text-3xl leading-none text-cream-950">{formatNumberValue(trendValue, 'CURRENCY_THRESHOLD')}</p>
          )}
          chart={performance.monthly_spend_trend.length > 0 ? (
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
                  tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
                  tickFormatter={monthTick}
                />
                <Tooltip formatter={(value: number) => formatNumberValue(Number(value), 'CURRENCY_THRESHOLD')} />
                <Area dataKey="spend" stroke="var(--teal-700)" strokeWidth={2.4} fill="url(#customer-spend-fill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        />
      </PerformanceCard>

      <DetailCardRenderer
        card={{
          ...brandMixCard,
          body: {
            items: brandMixCard.body.map((row, index) => ({
              id: `${row.brand}-${index}`,
              label: row.brand,
              pct: null,
              value: formatNumberValue(row.spend, 'CURRENCY_THRESHOLD'),
              tone: MIX_COLORS[index % MIX_COLORS.length],
            })),
            emptyTitle: 'No brand mix data yet',
            emptyDescription: 'This customer has no recent brand-level purchase mix.',
            mode: 'mix',
          },
        }}
      />
    </section>
  );
}
