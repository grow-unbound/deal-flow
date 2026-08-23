'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { CardEmptyState } from '@/components/seller/detail';
import { formatNumberValue } from '@/lib/utils';
import type { SellerDashboardCustomerActivityV4 } from '@/types/seller-dashboard';

const SEGMENTS: Array<{ id: keyof SellerDashboardCustomerActivityV4; label: string; color: string }> = [
  { id: 'purchasing', label: 'Purchasing', color: 'var(--teal-700)' },
  { id: 'repeat', label: 'Repeat', color: 'var(--ember-700)' },
  { id: 'inactive', label: 'Inactive', color: 'var(--cream-400)' },
  { id: 'overdue', label: 'Overdue', color: 'var(--danger-500)' },
];

export function CustomerActivityDonut({ data, loading }: { data: SellerDashboardCustomerActivityV4 | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="p-5">
        <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded-full bg-cream-100" />
      </div>
    );
  }

  const segments = SEGMENTS.map((segment) => ({ ...segment, value: Number(data?.[segment.id] ?? 0) }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return (
      <div className="p-5">
        <CardEmptyState title="No customer activity yet" description="Purchasing, repeat, inactive, and overdue customers will appear here once buyer activity is recorded." />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-5">
      <div className="h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={segments} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {segments.map((segment) => (
                <Cell key={segment.id} fill={segment.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [formatNumberValue(Number(value), 'COUNT'), name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {segments.map((segment) => (
          <div key={segment.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: segment.color }} />
              <span className="truncate text-base text-cream-900">{segment.label}</span>
            </div>
            <span className="font-mono text-sm font-semibold text-cream-900 tabular-nums">
              {formatNumberValue(segment.value, 'COUNT')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
