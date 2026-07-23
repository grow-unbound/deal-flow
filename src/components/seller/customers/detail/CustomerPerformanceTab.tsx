'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { DetailCardRenderer, PerformanceCard, TrendFrame, type DetailCardPayload } from '@/components/seller/detail';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatNumberValue } from '@/lib/utils';

interface CustomerPerformanceTabProps {
  performance: TenantCustomerDetailResponse['performance'];
  performanceV2: TenantCustomerDetailResponse['performance_v2'];
  performanceCards?: unknown[];
}

const MIX_COLORS = ['#204A41', '#B7703D', '#A59984', '#C07A43'];

function monthTick(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short' });
}

export function CustomerPerformanceTab({ performance, performanceV2, performanceCards }: CustomerPerformanceTabProps) {
  const trendValue = performance.monthly_spend_trend[performance.monthly_spend_trend.length - 1]?.spend ?? 0;
  const brandMixCard: DetailCardPayload<typeof performanceV2.brand_mix.rows> = {
    representation: 'mix',
    title: 'What this customer buys',
    subtitle: 'Brand mix · 90D',
    time_basis: '90D',
    availability: 'ready',
    body: performanceV2.brand_mix.rows,
  };
  const topSkusCard: DetailCardPayload<typeof performanceV2.top_skus> = {
    representation: 'ranked_list',
    title: 'Products requested repeatedly',
    subtitle: 'What this customer keeps reordering',
    time_basis: '90D',
    availability: 'ready',
    body: performanceV2.top_skus,
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
            <div className="flex items-end gap-3">
              <p className="font-display text-3xl leading-none text-cream-950">{formatNumberValue(trendValue, 'CURRENCY_THRESHOLD')}</p>
              <p className="pb-1 text-base text-cream-700">
                {performanceV2.headline.orders_mtd} invoices · Avg invoice {formatNumberValue(performanceV2.headline.aov_mtd, 'CURRENCY_THRESHOLD')}
              </p>
            </div>
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
              pct: row.pct,
              value: formatNumberValue(row.spend, 'CURRENCY_THRESHOLD'),
              tone: MIX_COLORS[index % MIX_COLORS.length],
            })),
            emptyTitle: 'No brand mix data yet',
            emptyDescription: 'This customer has no recent brand-level purchase mix.',
            mode: 'mix',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          ...topSkusCard,
          body: {
            items: topSkusCard.body.map((sku, index) => ({
              id: `${sku.sku}-${index}`,
              label: sku.name,
              meta: sku.sku,
              value: formatNumberValue(sku.revenue, 'CURRENCY_THRESHOLD'),
              supporting: `${sku.units} units`,
            })),
            emptyTitle: 'No SKU activity yet',
            emptyDescription: 'This customer has not requested any products in the selected horizon.',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'payment-behavior',
          representation: 'distribution',
          title: 'Payment behavior',
          subtitle: 'Credit usage and collection context',
          body: {
            items: [
              {
                id: 'credit-used',
                label: 'Credit used',
                pct: performanceV2.credit_ops.credit_util_pct,
                value: formatNumberValue(performanceV2.credit_ops.credit_used, 'CURRENCY_EXACT'),
                supporting: `of ${formatNumberValue(performanceV2.credit_ops.credit_limit, 'CURRENCY_EXACT')}`,
              },
              {
                id: 'last-order',
                label: 'Last order',
                pct: null,
                value: performanceV2.credit_ops.last_order_days_ago,
                supporting: formatNumberValue(performanceV2.credit_ops.last_order_value, 'CURRENCY_EXACT'),
              },
              {
                id: 'catalog-opens',
                label: 'Campaign opens',
                pct: null,
                value: performanceV2.credit_ops.catalog_opens_mtd,
                supporting: 'recent buyer app opens',
              },
            ],
            emptyTitle: performanceV2.credit_ops.payment_behavior_summary,
            emptyDescription: 'The customer does not have enough due-date and payment-history data yet.',
          },
        }}
      />
    </section>
  );
}
