'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CardEmptyState } from '@/components/seller/detail';
import { formatNumberValue } from '@/lib/utils';
import type { SellerDashboardLocationPerformanceEntryV4 } from '@/types/seller-dashboard';

const SERIES: Array<{ id: 'sales_value' | 'overdue_amount' | 'open_demand_value'; label: string; color: string }> = [
  { id: 'sales_value', label: 'Sales', color: 'var(--teal-700)' },
  { id: 'overdue_amount', label: 'Overdue', color: 'var(--danger-500)' },
  { id: 'open_demand_value', label: 'Open demand', color: 'var(--ember-700)' },
];

export function LocationPerformanceChart({
  locations,
  loading,
}: {
  locations: SellerDashboardLocationPerformanceEntryV4[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="p-4">
        <div className="h-[240px] animate-pulse rounded-[12px] bg-cream-100" />
      </div>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="p-5">
        <CardEmptyState title="No location metrics yet" description="Sales, overdue, and open-demand bars will appear once location-level activity is recorded." />
      </div>
    );
  }

  const data = locations.map((location) => ({
    name: location.name,
    sales_value: location.sales_value,
    overdue_amount: location.overdue_amount,
    open_demand_value: location.open_demand_value,
  }));

  return (
    <div className="h-[260px] px-4 pb-4 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 28, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={50}
            tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
            tickFormatter={(v: number) => formatNumberValue(v, 'CURRENCY_THRESHOLD')}
            width={56}
          />
          <Tooltip formatter={(value: number) => formatNumberValue(Number(value), 'CURRENCY_THRESHOLD')} />
          <Legend wrapperStyle={{ fontSize: 'var(--yk-text-sm)' }} />
          {SERIES.map((series) => (
            <Bar key={series.id} dataKey={series.id} name={series.label} fill={series.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
