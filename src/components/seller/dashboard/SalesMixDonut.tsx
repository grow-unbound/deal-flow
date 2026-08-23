'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { CardEmptyState } from '@/components/seller/detail';
import { formatNumberValue } from '@/lib/utils';

const PALETTE = ['#204A41', '#B7703D', '#A59984', '#C07A43', '#6E8F87', '#8C6B4F', '#4C7A6E', '#D9A066'];

export interface SalesMixDonutItem {
  id: string;
  label: string;
  value: number;
  pct: number;
  supporting?: string;
}

export function SalesMixDonut({
  items,
  loading,
  emptyTitle,
  emptyDescription,
}: {
  items: SalesMixDonutItem[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (loading) {
    return (
      <div className="p-5">
        <div className="mx-auto h-[160px] w-[160px] animate-pulse rounded-full bg-cream-100" />
      </div>
    );
  }

  const segments = items.map((item, index) => ({ ...item, color: PALETTE[index % PALETTE.length] }));

  if (segments.length === 0) {
    return (
      <div className="p-5">
        <CardEmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 p-5">
      <div className="h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={segments} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {segments.map((segment) => (
                <Cell key={segment.id} fill={segment.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [formatNumberValue(Number(value), 'CURRENCY_THRESHOLD'), name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5 overflow-y-auto" style={{ maxHeight: 160 }}>
        {segments.map((segment) => (
          <div key={segment.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: segment.color }} />
              <div className="min-w-0">
                <span className="block truncate text-base text-cream-900">{segment.label}</span>
                {segment.supporting ? <span className="block truncate text-xs text-cream-600">{segment.supporting}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-sm font-semibold text-cream-900 tabular-nums">{formatNumberValue(segment.value, 'CURRENCY_THRESHOLD')}</div>
              <div className="text-xs text-cream-600">{segment.pct}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
