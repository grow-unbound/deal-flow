'use client';

import { Check } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { PlanTier } from '@/constants/tier-limits';

type CellVal = boolean | string;

const ROWS: { feature: string; starter: CellVal; growth: CellVal; scale: CellVal }[] = [
  { feature: 'All core modules', starter: true, growth: true, scale: true },
  { feature: 'Buyer app (WhatsApp OTP)', starter: true, growth: true, scale: true },
  { feature: 'Catalog publishing', starter: true, growth: true, scale: true },
  { feature: 'Tally & Zoho integrations', starter: true, growth: true, scale: true },
  { feature: 'Cohort limit', starter: '5', growth: '20', scale: 'Unlimited' },
  { feature: 'Price list limit', starter: '2', growth: '10', scale: 'Unlimited' },
  { feature: 'Published catalog limit', starter: '3', growth: '15', scale: 'Unlimited' },
];

function Cell({ val, current }: { val: CellVal; current: boolean }) {
  if (val === true) {
    return (
      <TableCell className={cn('text-center', current && 'bg-teal-50/80')}>
        <Check className="mx-auto h-4 w-4 text-success-600" strokeWidth={2.5} aria-label="Included" />
      </TableCell>
    );
  }
  if (val === false) {
    return (
      <TableCell className={cn('text-center text-cream-400', current && 'bg-teal-50/80')}>
        —
      </TableCell>
    );
  }
  return (
    <TableCell className={cn('text-center font-mono text-caption font-medium text-cream-800', current && 'bg-teal-50/80')}>
      {val}
    </TableCell>
  );
}

export function PlanComparisonTable({ currentPlan }: { currentPlan: PlanTier }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cream-200">
      <Table>
        <TableHeader>
          <TableRow className="bg-cream-50 hover:bg-cream-50">
            <TableHead className="w-[40%] pl-4 text-caption font-semibold uppercase tracking-wide text-cream-600">
              Feature
            </TableHead>
            <TableHead
              className={cn(
                'text-center text-caption font-semibold uppercase tracking-wide text-cream-600',
                currentPlan === 'starter' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Starter
            </TableHead>
            <TableHead
              className={cn(
                'text-center text-caption font-semibold uppercase tracking-wide text-cream-600',
                currentPlan === 'growth' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Growth
            </TableHead>
            <TableHead
              className={cn(
                'text-center text-caption font-semibold uppercase tracking-wide text-cream-600',
                currentPlan === 'scale' && 'bg-teal-50/60 text-teal-900',
              )}
            >
              Scale
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((row) => (
            <TableRow key={row.feature}>
              <TableCell className="pl-4 font-medium text-cream-900">{row.feature}</TableCell>
              <Cell val={row.starter} current={currentPlan === 'starter'} />
              <Cell val={row.growth} current={currentPlan === 'growth'} />
              <Cell val={row.scale} current={currentPlan === 'scale'} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
