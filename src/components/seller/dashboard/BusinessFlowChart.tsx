'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { TrendFrame } from '@/components/seller/detail';
import { formatNumberValue } from '@/lib/utils';
import type { SellerDashboardBusinessFlowV4 } from '@/types/seller-dashboard';

export type BusinessFlowToggle = 'sales' | 'demand';

function monthTick(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-IN', { month: 'short' });
}

export function BusinessFlowChart({
  data,
  loading,
  toggle,
}: {
  data: SellerDashboardBusinessFlowV4 | undefined;
  loading: boolean;
  toggle: BusinessFlowToggle;
}) {
  const months = data?.months ?? [];
  const demandLabel = data?.primary_demand_kind === 'orders' ? 'Orders' : 'Estimates';

  // Toggle is a pure client-side render switch over already-fetched data --
  // both series live in the same 6 rows, no extra fetch on toggle.
  const chartData = months.map((m) => ({
    period_start: m.period_start,
    value: toggle === 'sales' ? m.invoice_value : m.demand_value,
    count: toggle === 'sales' ? m.invoice_count : m.demand_count,
  }));
  const latest = chartData[chartData.length - 1];

  return (
    <TrendFrame
      loading={loading}
      emptyTitle="No sales history yet"
      emptyDescription="Invoiced sales and demand will appear here once trailing months have data."
      summary={(
        <div>
          <p className="font-display text-3xl leading-none text-cream-950">
            {formatNumberValue(latest?.value ?? 0, 'CURRENCY_THRESHOLD')}
          </p>
          <p className="mt-1 text-sm text-cream-600">
            {formatNumberValue(latest?.count ?? 0, 'COUNT')} {toggle === 'sales' ? 'invoices' : demandLabel.toLowerCase()} this month
          </p>
        </div>
      )}
      chart={chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="dashboard-business-flow-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--teal-700)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--teal-700)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
            <XAxis
              dataKey="period_start"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
              tickFormatter={monthTick}
            />
            <Tooltip
              labelFormatter={monthTick}
              formatter={(value: number) => formatNumberValue(Number(value), 'CURRENCY_THRESHOLD')}
            />
            <Area dataKey="value" stroke="var(--teal-700)" strokeWidth={2.4} fill="url(#dashboard-business-flow-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    />
  );
}
