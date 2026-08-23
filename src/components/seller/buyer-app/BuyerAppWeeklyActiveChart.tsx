'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { TrendFrame } from '@/components/seller/detail';
import { formatNumberValue } from '@/lib/utils';

function weekTick(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function BuyerAppWeeklyActiveChart({ data, loading }: { data: Array<{ week: string; count: number }> | undefined; loading: boolean }) {
  const weeks = data ?? [];
  const latest = weeks[weeks.length - 1];

  return (
    <TrendFrame
      loading={loading}
      emptyTitle="No activity data yet"
      emptyDescription="Weekly active buyers will appear here once buyers use the app."
      summary={(
        <div>
          <p className="font-display text-xl font-medium leading-[1.05] text-[#4A3F35] tabular-nums">
            {formatNumberValue(latest?.count ?? 0, 'COUNT')}
          </p>
          <p className="mt-1 text-sm text-cream-600">active buyers this week</p>
        </div>
      )}
      chart={weeks.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={weeks}>
            <defs>
              <linearGradient id="buyer-app-weekly-active-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--teal-700)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--teal-700)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cream-300)" />
            <XAxis
              dataKey="week"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--cream-700)', fontSize: 'var(--yk-text-sm)' }}
              tickFormatter={weekTick}
            />
            <Tooltip
              formatter={(val: number) => [val, 'Active buyers']}
              labelFormatter={(label: string) => {
                const d = new Date(label);
                return `Week of ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
              }}
            />
            <Area dataKey="count" stroke="var(--teal-700)" strokeWidth={2.4} fill="url(#buyer-app-weekly-active-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    />
  );
}
