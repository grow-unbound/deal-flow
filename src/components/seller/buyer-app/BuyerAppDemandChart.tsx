'use client';

import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { TrendFrame } from '@/components/seller/detail';
import { cn, formatNumberValue } from '@/lib/utils';

type DemandMode = 'value' | 'count';

function weekTick(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function BuyerAppDemandChart({
  data,
  loading,
}: {
  data: Array<{ week: string; value: number; count: number }> | undefined;
  loading: boolean;
}) {
  const [mode, setMode] = useState<DemandMode>('value');
  const weeks = data ?? [];
  const latest = weeks[weeks.length - 1];

  return (
    <TrendFrame
      loading={loading}
      emptyTitle="No demand data yet"
      emptyDescription="App demand will appear here once buyers submit orders or estimates."
      summary={(
        <div>
          <p className="font-display text-3xl leading-none text-cream-950">
            {mode === 'value' ? formatNumberValue(latest?.value ?? 0, 'CURRENCY_THRESHOLD') : formatNumberValue(latest?.count ?? 0, 'COUNT')}
          </p>
          <p className="mt-1 text-sm text-cream-600">this week</p>
        </div>
      )}
      controls={(
        <div className="inline-flex rounded-full border border-cream-300 bg-cream-50 p-1">
          {([
            { id: 'value' as const, label: '₹ Value' },
            { id: 'count' as const, label: 'Count' },
          ]).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold transition',
                mode === option.id ? 'bg-white text-teal-700 shadow-sm' : 'text-cream-700 hover:text-cream-900',
              )}
              aria-pressed={mode === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      chart={weeks.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={weeks}>
            <defs>
              <linearGradient id="buyer-app-demand-fill" x1="0" y1="0" x2="0" y2="1">
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
              formatter={(val: number) => [
                mode === 'value' ? formatNumberValue(val, 'CURRENCY_THRESHOLD') : val,
                mode === 'value' ? 'Demand value' : 'Demand count',
              ]}
              labelFormatter={(label: string) => {
                const d = new Date(label);
                return `Week of ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
              }}
            />
            <Area dataKey={mode} stroke="var(--teal-700)" strokeWidth={2.4} fill="url(#buyer-app-demand-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    />
  );
}
