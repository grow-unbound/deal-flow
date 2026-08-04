'use client';

import { Check } from 'lucide-react';

import { ScrollableTableShell } from '@/components/seller/layout/ScrollableTableShell';
import { cn } from '@/lib/utils';
import type { PlanTier } from '@/constants/tier-limits';

type CellVal = boolean | string;

const ROWS: { feature: string; lite: CellVal; starter: CellVal; growth: CellVal; scale: CellVal }[] = [
  { feature: 'Buyer app (WhatsApp OTP)', lite: false, starter: true, growth: true, scale: true },
  { feature: 'Campaign publishing', lite: false, starter: true, growth: true, scale: true },
  { feature: 'Tally & Zoho integrations', lite: true, starter: true, growth: true, scale: true },
  { feature: 'Customer groups / price lists / catalogs', lite: '—', starter: 'Unlimited', growth: 'Unlimited', scale: 'Unlimited' },
  { feature: 'Buyer app monthly active users', lite: '0', starter: '50', growth: '500', scale: 'Unlimited' },
  { feature: 'Locations', lite: '1', starter: '1', growth: '10', scale: 'Unlimited' },
];

function Cell({
  val,
  current,
}: {
  val: CellVal;
  current: boolean;
}) {
  if (val === true) {
    return (
      <td className={cn('border-b border-cream-100 px-3 py-3 text-center align-middle', current && 'bg-teal-50/80')}>
        <Check className="mx-auto h-4 w-4 text-success-600" strokeWidth={2.5} aria-label="Included" />
      </td>
    );
  }
  if (val === false) {
    return (
      <td
        className={cn(
          'border-b border-cream-100 px-3 py-3 text-center align-middle text-base text-cream-400',
          current && 'bg-teal-50/80',
        )}
      >
        —
      </td>
    );
  }
  return (
    <td
      className={cn(
        'border-b border-cream-100 px-3 py-3 text-center align-middle font-mono text-sm tabular-nums font-medium text-cream-800',
        current && 'bg-teal-50/80',
      )}
    >
      {val}
    </td>
  );
}

export function PlanComparisonTable({ currentPlan }: { currentPlan: PlanTier }) {
  return (
    <ScrollableTableShell className="rounded-lg border border-cream-200 bg-white">
      <table className="w-full min-w-max border-collapse text-base">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50">
            <th className="table-label w-[40%] px-3 py-3 text-left">Feature</th>
            <th
              className={cn(
                'table-label px-3 py-3 text-center',
                currentPlan === 'lite' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Lite
            </th>
            <th
              className={cn(
                'table-label px-3 py-3 text-center',
                currentPlan === 'starter' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Starter
            </th>
            <th
              className={cn(
                'table-label px-3 py-3 text-center',
                currentPlan === 'growth' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Growth
            </th>
            <th
              className={cn(
                'table-label px-3 py-3 text-center',
                currentPlan === 'scale' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Scale
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.feature} className="bg-white">
              <td className="border-b border-cream-100 px-3 py-3 font-medium text-cream-900">{row.feature}</td>
              <Cell val={row.lite} current={currentPlan === 'lite'} />
              <Cell val={row.starter} current={currentPlan === 'starter'} />
              <Cell val={row.growth} current={currentPlan === 'growth'} />
              <Cell val={row.scale} current={currentPlan === 'scale'} />
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableShell>
  );
}
